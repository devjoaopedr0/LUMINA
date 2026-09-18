import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, LoaderCircle, Save, UploadCloud, UserRound, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, apiGetUserVestibular, apiListAuthSessions, apiRevokeAuthSession, apiSetVestibular, type AuthSession } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

export function Profile() {
  const { user, updateProfile, logout, logoutAll } = useAuth();
  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', avatarUrl: '', phone: '', birthDate: '', bio: '', educationLevel: '', schoolYear: '', schoolName: '', desiredCourse: '', targetUniversity: '',
  });
  const [targetExam, setTargetExam] = useState('');
  const [targetExamDate, setTargetExamDate] = useState('');
  const [savingExam, setSavingExam] = useState(false);
  const [examError, setExamError] = useState('');
  const [examSuccess, setExamSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closingSessions, setClosingSessions] = useState(false);
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [sessionError, setSessionError] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      username: user.username ?? '',
      avatarUrl: user.avatarUrl ?? '',
      phone: user.phone ?? '',
      birthDate: user.birthDate?.slice(0, 10) ?? '',
      bio: user.bio ?? '',
      educationLevel: user.educationLevel ?? '',
      schoolYear: user.schoolYear?.toString() ?? '',
      schoolName: user.schoolName ?? '',
      desiredCourse: user.desiredCourse ?? '',
      targetUniversity: user.targetUniversity ?? '',
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;
    void apiGetUserVestibular(token).then((goal) => {
      setTargetExam(goal?.customName ?? goal?.exam?.name ?? '');
      setTargetExamDate(goal?.targetDate?.slice(0, 10) ?? '');
    }).catch(() => setExamError('Não foi possível carregar o vestibular-alvo.'));
  }, [user?.id]);

  async function saveTargetExam() {
    const token = getAccessToken();
    if (!token) return;
    setSavingExam(true);
    setExamError('');
    setExamSuccess(false);
    try {
      await apiSetVestibular(token, { customName: targetExam.trim() || null, targetDate: targetExamDate || undefined });
      setExamSuccess(true);
    } catch (caught) {
      setExamError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar o vestibular-alvo.');
    } finally { setSavingExam(false); }
  }

  useEffect(() => {
    if (!user) return;
    const token = getAccessToken();
    if (token) void apiListAuthSessions(token).then(setSessions).catch(() => setSessionError('Não foi possível carregar as sessões.'));
  }, [user]);

  async function revokeSession(id: string, current: boolean) {
    const token = getAccessToken();
    if (!token) return;
    setRevokingId(id);
    setSessionError('');
    try {
      await apiRevokeAuthSession(token, id);
      if (current) { logout(); return; }
      setSessions((items) => items.filter((item) => item.id !== id));
    } catch (caught) {
      setSessionError(caught instanceof ApiError ? caught.message : 'Não foi possível encerrar a sessão.');
    } finally { setRevokingId(null); }
  }

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setSuccess(false);
  }

  async function processImageFile(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Escolha uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 8 MB.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const size = Math.min(256, bitmap.width, bitmap.height);
      const sourceSize = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d')?.drawImage(
        bitmap,
        (bitmap.width - sourceSize) / 2,
        (bitmap.height - sourceSize) / 2,
        sourceSize,
        sourceSize,
        0,
        0,
        size,
        size,
      );
      bitmap.close();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.76);
      if (dataUrl.length > 95000) {
        setError('Não foi possível compactar essa imagem. Tente uma foto menor.');
        return;
      }
      update('avatarUrl', dataUrl);
      setError('');
    } catch {
      setError('Não foi possível processar essa imagem.');
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void processImageFile(event.dataTransfer.files[0]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);
    try {
      await updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        username: form.username.trim() || null,
        avatarUrl: form.avatarUrl.trim() || null,
        phone: form.phone.trim() || null,
        birthDate: form.birthDate || null,
        bio: form.bio.trim() || null,
        educationLevel: form.educationLevel || null,
        schoolYear: form.schoolYear ? Number(form.schoolYear) : null,
        schoolName: form.schoolName.trim() || null,
        desiredCourse: form.desiredCourse.trim() || null,
        targetUniversity: form.targetUniversity.trim() || null,
      });
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar seu perfil.');
    } finally {
      setSaving(false);
    }
  }

  const initials = `${form.firstName[0] ?? ''}${form.lastName[0] ?? ''}`.toUpperCase() || 'LU';

  async function handleLogoutAll() {
    setClosingSessions(true);
    setError('');
    try { await logoutAll(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Não foi possível encerrar as sessões.'); }
    finally { setClosingSessions(false); }
  }

  return (
    <div className="min-h-screen bg-surface-card">
      <header className="border-b border-surface-line bg-white">
        <div className="container-lumina flex h-[72px] items-center justify-between">
          <Logo />
          <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-500 hover:text-graphite">
            <ArrowLeft className="h-4 w-4" /> Voltar ao início
          </Link>
        </div>
      </header>

      <main className="container-lumina py-10 md:py-14">
        <div className="mb-8">
          <p className="text-sm font-semibold text-primary-700">Sua conta</p>
          <h1 className="mt-1 text-3xl font-semibold text-graphite">Meu perfil</h1>
          <p className="mt-2 text-sm text-graphite-500">Mantenha seus dados atualizados para personalizar sua experiência.</p>
          <button type="button" disabled={closingSessions} onClick={() => void handleLogoutAll()} className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">{closingSessions ? 'Encerrando sessões...' : 'Sair de todos os dispositivos'}</button>
          <section className="mt-6 rounded-xl border border-surface-line bg-white p-4" aria-label="Sessões ativas">
            <h2 className="font-semibold text-graphite">Sessões ativas</h2>
            {sessionError && <p role="alert" className="mt-2 text-sm text-alert">{sessionError}</p>}
            {sessions.map((session) => <div key={session.id} className="mt-3 flex items-center justify-between gap-4 border-t border-surface-line pt-3 text-sm">
              <span>{session.current ? 'Este dispositivo' : 'Outra sessão'} · Iniciada em {new Date(session.createdAt).toLocaleString('pt-BR')}</span>
              <button type="button" disabled={revokingId === session.id} onClick={() => void revokeSession(session.id, session.current)} className="font-semibold text-red-700 disabled:opacity-50">Encerrar</button>
            </div>)}
          </section>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit bg-white text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-graphite text-2xl font-semibold text-white">
              {form.avatarUrl ? <img src={form.avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" /> : initials}
            </div>
            <p className="mt-4 font-semibold text-graphite">{form.firstName || 'Seu nome'} {form.lastName}</p>
            <p className="mt-1 text-xs text-graphite-400">{user?.email}</p>
            <div
              role="button"
              tabIndex={0}
              aria-label="Enviar foto de perfil"
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click(); }}
              className={`mt-5 cursor-pointer rounded-xl border-2 border-dashed px-3 py-5 transition focus:outline-none focus:ring-2 focus:ring-primary/30 ${dragging ? 'border-primary bg-primary/10' : 'border-surface-line bg-surface-card hover:border-primary/60 hover:bg-primary/5'}`}
            >
              <UploadCloud className="mx-auto h-6 w-6 text-primary-700" />
              <p className="mt-2 text-xs font-semibold text-graphite">Arraste sua foto aqui</p>
              <p className="mt-1 text-[11px] text-graphite-400">ou clique para abrir câmera/arquivos · JPG, PNG ou WebP</p>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void processImageFile(event.target.files?.[0])} />
            </div>
            {form.avatarUrl && (
              <button type="button" onClick={() => update('avatarUrl', '')} className="mt-3 inline-flex items-center gap-1 text-xs text-graphite-400 hover:text-alert">
                <X className="h-3.5 w-3.5" /> Remover foto
              </button>
            )}
          </Card>

          <Card className="bg-white">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15"><UserRound className="h-5 w-5" /></span>
              <div><h2 className="font-semibold text-graphite">Seu perfil</h2><p className="text-xs text-graphite-400">Dados pessoais e acadêmicos</p></div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nome" required><Input value={form.firstName} onChange={(e) => update('firstName', e.target.value)} minLength={2} maxLength={60} required /></Field>
              <Field label="Sobrenome"><Input value={form.lastName} onChange={(e) => update('lastName', e.target.value)} maxLength={80} /></Field>
              <Field label="Nome de usuário"><Input value={form.username} onChange={(e) => update('username', e.target.value)} minLength={3} maxLength={30} pattern="[a-zA-Z0-9._-]+" placeholder="seu.usuario" /></Field>
              <Field label="Telefone"><Input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+55 (11) 99999-9999" /></Field>
              <Field label="Data de nascimento"><Input type="date" value={form.birthDate} onChange={(e) => update('birthDate', e.target.value)} /></Field>
              <div className="sm:col-span-2">
                <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-graphite">Bio</label>
                <textarea id="bio" value={form.bio} onChange={(e) => update('bio', e.target.value)} maxLength={500} rows={4} className="w-full resize-none rounded-xl border border-surface-line bg-white px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Conte um pouco sobre seus objetivos de estudo." />
                <p className="mt-1 text-right text-xs text-graphite-400">{form.bio.length}/500</p>
              </div>
            </div>

            <div className="mt-7 border-t border-surface-line pt-6">
              <h3 className="mb-4 font-semibold text-graphite">Dados acadêmicos</h3>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Etapa de ensino"><select value={form.educationLevel} onChange={(e) => update('educationLevel', e.target.value)} className="w-full rounded-xl border border-surface-line bg-white px-4 py-3 text-sm"><option value="">Não informado</option><option value="FUNDAMENTAL_II">Ensino fundamental II</option><option value="ENSINO_MEDIO">Ensino médio</option><option value="CURSINHO">Cursinho</option><option value="SUPERIOR">Ensino superior</option><option value="OUTRO">Outro</option></select></Field>
                <Field label="Série ou ano"><Input type="number" min={1} max={9} value={form.schoolYear} onChange={(e) => update('schoolYear', e.target.value)} placeholder="Ex.: 3" /></Field>
                <div className="sm:col-span-2"><Field label="Escola ou cursinho atual"><Input value={form.schoolName} onChange={(e) => update('schoolName', e.target.value)} maxLength={120} placeholder="Opcional" /></Field></div>
                <Field label="Curso desejado"><Input value={form.desiredCourse} onChange={(e) => update('desiredCourse', e.target.value)} maxLength={120} placeholder="Ex.: Medicina" /></Field>
                <Field label="Universidade-alvo"><Input value={form.targetUniversity} onChange={(e) => update('targetUniversity', e.target.value)} maxLength={120} placeholder="Ex.: UFC" /></Field>
              </div>
              <div className="mt-6 border-t border-surface-line pt-5">
                <h4 className="mb-3 font-semibold text-graphite">Vestibular-alvo</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Prova ou vestibular"><Input value={targetExam} onChange={(e) => { setTargetExam(e.target.value); setExamSuccess(false); }} maxLength={100} placeholder="Ex.: ENEM ou UECE" /></Field>
                  <Field label="Data da prova"><Input type="date" value={targetExamDate} onChange={(e) => { setTargetExamDate(e.target.value); setExamSuccess(false); }} /></Field>
                </div>
                {examError && <p role="alert" className="mt-3 text-sm text-alert">{examError}</p>}
                {examSuccess && <p className="mt-3 text-sm text-success">Vestibular-alvo salvo.</p>}
                <button type="button" disabled={savingExam} onClick={() => void saveTargetExam()} className="mt-4 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-700 disabled:opacity-50">{savingExam ? 'Salvando...' : 'Salvar vestibular-alvo'}</button>
              </div>
            </div>

            {error && <p role="alert" className="mt-5 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">{error}</p>}
            {success && <p className="mt-5 flex items-center gap-2 rounded-xl border border-success/20 bg-success/5 p-3 text-sm text-graphite-600"><CheckCircle2 className="h-4 w-4 text-success" /> Perfil atualizado com sucesso.</p>}

            <div className="mt-7 flex justify-end">
              <Button type="submit" disabled={saving || !form.firstName.trim()}>
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </Card>
        </form>
      </main>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-graphite">{label}{required && <span className="text-alert"> *</span>}</span>{children}</label>;
}
