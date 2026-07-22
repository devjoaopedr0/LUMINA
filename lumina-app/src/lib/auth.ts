import seedUsers from "@/data/users.json";

export type AccountType = "aluno" | "instituicao";

export interface AppUser {
  name: string;
  email: string;
  password: string;
  accountType: AccountType;
}

const USERS_KEY = "lumina_users";
const SESSION_KEY = "lumina_session";

function getUsers(): AppUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  if (raw) return JSON.parse(raw);
  localStorage.setItem(USERS_KEY, JSON.stringify(seedUsers));
  return seedUsers as AppUser[];
}

function saveUsers(users: AppUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function login(email: string, password: string): AppUser | null {
  const user = getUsers().find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
  );
  if (!user) return null;
  localStorage.setItem(SESSION_KEY, user.email);
  return user;
}

export function signup(
  name: string,
  email: string,
  password: string,
  accountType: AccountType
): { user?: AppUser; error?: string } {
  const users = getUsers();
  const exists = users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (exists) return { error: "Já existe uma conta com esse e-mail." };

  const newUser: AppUser = { name, email: email.trim(), password, accountType };
  saveUsers([...users, newUser]);
  localStorage.setItem(SESSION_KEY, newUser.email);
  return { user: newUser };
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function getCurrentUser(): AppUser | null {
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return null;
  return getUsers().find((u) => u.email === email) ?? null;
}
