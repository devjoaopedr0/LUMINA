import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, Image, LoaderCircle, Save, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/lib/api';

export function Profile() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', avatarUrl: '', phone: '', birthDate: '', bio: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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
    });
  }, [user]);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setSuccess(false);
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
      });
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar seu perfil.');
    } finally {
      setSaving(false);
    }
  }

  const initials = `${form.firstName[0] ?? ''}${form.lastName[0] ?? ''}`.toUpperCase() || 'LU';

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
        </div>

        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit bg-white text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-graphite text-2xl font-semibold text-white">
              {form.avatarUrl ? <img src={form.avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" /> : initials}
            </div>
            <p className="mt-4 font-semibold text-graphite">{form.firstName || 'Seu nome'} {form.lastName}</p>
            <p className="mt-1 text-xs text-graphite-400">{user?.email}</p>
            <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-surface-card px-3 py-2 text-xs text-graphite-500">
              <Image className="h-4 w-4" /> Use uma URL pública para sua foto
            </div>
          </Card>

          <Card className="bg-white">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15"><UserRound className="h-5 w-5" /></span>
              <div><h2 className="font-semibold text-graphite">Dados pessoais</h2><p className="text-xs text-graphite-400">Campos públicos do seu perfil</p></div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nome" required><Input value={form.firstName} onChange={(e) => update('firstName', e.target.value)} minLength={2} maxLength={60} required /></Field>
              <Field label="Sobrenome"><Input value={form.lastName} onChange={(e) => update('lastName', e.target.value)} maxLength={80} /></Field>
              <Field label="Nome de usuário"><Input value={form.username} onChange={(e) => update('username', e.target.value)} minLength={3} maxLength={30} pattern="[a-zA-Z0-9._-]+" placeholder="seu.usuario" /></Field>
              <Field label="Telefone"><Input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+55 (11) 99999-9999" /></Field>
              <Field label="Data de nascimento"><Input type="date" value={form.birthDate} onChange={(e) => update('birthDate', e.target.value)} /></Field>
              <Field label="URL da foto"><Input type="url" value={form.avatarUrl} onChange={(e) => update('avatarUrl', e.target.value)} placeholder="https://..." /></Field>
              <div className="sm:col-span-2">
                <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-graphite">Bio</label>
                <textarea id="bio" value={form.bio} onChange={(e) => update('bio', e.target.value)} maxLength={500} rows={4} className="w-full resize-none rounded-xl border border-surface-line bg-white px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Conte um pouco sobre seus objetivos de estudo." />
                <p className="mt-1 text-right text-xs text-graphite-400">{form.bio.length}/500</p>
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
