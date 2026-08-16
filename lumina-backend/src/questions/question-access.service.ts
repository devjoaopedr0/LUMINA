import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Workspace, WorkspaceMemberStatus } from '@prisma/client';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { QUESTION_PERMISSIONS } from './question-permissions.constants';

/** E-mail institucional que identifica o banco de questões central do Lumina.
 * O seed cria a Institution "Lumina" com este e-mail e o Workspace do banco
 * vinculado a ela — é por este identificador estável que o access service
 * reconhece o banco público. */
export const QUESTION_BANK_INSTITUTION_EMAIL = 'banco@lumina.app';

/**
 * Controle de acesso do banco de questões, baseado no sistema de papéis já
 * existente (WorkspaceMember -> Role -> RolePermission -> Permission).
 *
 * O banco central ("Banco de Questões Lumina") é um Workspace INSTITUTION
 * público: QUALQUER usuário autenticado pode ler, responder e favoritar as
 * questões dele. Escrever (criar/editar/excluir/importar) exige ser membro
 * ativo com a permissão QUESTION_MANAGE — na prática, apenas o admin interno.
 *
 * Nos demais workspaces (pessoal e institucionais) o comportamento é o
 * anterior:
 * - "use": ver, responder e favoritar — qualquer membro ATIVO;
 * - "manage": criar, editar, excluir e importar — dono do workspace pessoal
 *   (acesso implícito) ou membro com a permissão QUESTION_MANAGE.
 *
 * Falha de acesso a uma questão específica vira 404 (não revela existência);
 * tentativa de gerenciar o banco público sem permissão recebe 403.
 */
@Injectable()
export class QuestionAccessService {
  constructor(private readonly workspacesRepository: WorkspacesRepository) {}

  /** Workspace pessoal do usuário, sem lançar erro quando não existir. */
  getPersonalWorkspace(userId: string): Promise<Workspace | null> {
    return this.workspacesRepository.findPersonalByUserId(userId);
  }

  /** Workspace pessoal do usuário — o destino padrão de questões nesta fase. */
  async getPersonalWorkspaceOrThrow(userId: string): Promise<Workspace> {
    const workspace = await this.getPersonalWorkspace(userId);
    if (!workspace) {
      throw new NotFoundException('Workspace pessoal não encontrado para este usuário.');
    }
    return workspace;
  }

  /** Workspace do banco central de questões (criado pelo seed). Nulo quando
   * o banco ainda não foi semeado. */
  getBankWorkspace(): Promise<Workspace | null> {
    return this.workspacesRepository.findBankWorkspace(QUESTION_BANK_INSTITUTION_EMAIL);
  }

  /** true quando o workspace é o banco central público. */
  async isBankWorkspace(workspaceId: string): Promise<boolean> {
    const bank = await this.getBankWorkspace();
    return bank?.id === workspaceId;
  }

  /** Garante que o usuário pode usar (ver/responder/favoritar) questões do
   * workspace. O banco central é público para usuários autenticados; nos
   * demais workspaces, apenas membros ATIVOS — quem não pertence ao workspace
   * não deve nem saber que a questão existe. */
  async assertCanUse(userId: string, workspaceId: string): Promise<void> {
    if (await this.isBankWorkspace(workspaceId)) {
      return;
    }
    const membership = await this.workspacesRepository.findMembership(userId, workspaceId);
    if (!membership || membership.status !== WorkspaceMemberStatus.ACTIVE) {
      throw new NotFoundException('Questão não encontrada.');
    }
  }

  /** Garante capacidade de gerenciar (criar/editar/excluir/importar) questões
   * no workspace. Banco central => exige ser membro ativo com QUESTION_MANAGE
   * (senão, 403). Pessoal => o usuário é o dono. Institucional => precisa da
   * permissão QUESTION_MANAGE no cargo. */
  async assertCanManage(userId: string, workspaceId: string): Promise<void> {
    const membership = await this.workspacesRepository.findMembership(userId, workspaceId);
    if (!membership || membership.status !== WorkspaceMemberStatus.ACTIVE) {
      if (await this.isBankWorkspace(workspaceId)) {
        throw new ForbiddenException(
          'Você não tem permissão para gerenciar questões do banco de questões.',
        );
      }
      throw new NotFoundException('Questão não encontrada.');
    }

    if (membership.workspace.type === 'PERSONAL') {
      return;
    }

    const hasManagePermission = membership.role.rolePermissions.some(
      (rp) => rp.permission.code === QUESTION_PERMISSIONS.MANAGE,
    );
    if (!hasManagePermission) {
      throw new ForbiddenException(
        'Você não tem permissão para gerenciar questões neste workspace.',
      );
    }
  }

  /** Versão booleana (não lança) da checagem de gerenciamento — usada para
   * expor a flag `canManage` nas respostas da API. */
  async hasManagePermission(userId: string, workspaceId: string): Promise<boolean> {
    const membership = await this.workspacesRepository.findMembership(userId, workspaceId);
    if (!membership || membership.status !== WorkspaceMemberStatus.ACTIVE) {
      return false;
    }
    if (membership.workspace.type === 'PERSONAL') {
      return true;
    }
    return membership.role.rolePermissions.some(
      (rp) => rp.permission.code === QUESTION_PERMISSIONS.MANAGE,
    );
  }
}
