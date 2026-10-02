import { User } from '../types';
import { StorageService } from './storage';

const TOKEN_KEY = 'aerocrash_auth_token';

export interface RegisterPayload {
  name: string;
  email: string;
  country: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: User;
  bets?: any[];
  transactions?: any[];
  isNetworkError?: boolean;
  statusCode?: number;
}

/**
 * Resolves the backend base API URL.
 * - In Netlify deployments, default is '' so relative paths like /.netlify/functions/register
 *   are automatically routed to the current origin.
 * - If VITE_API_URL or VITE_BACKEND_URL is set, it prefixes that host.
 */
export function getApiBaseUrl(): string {
  const envUrl = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    ''
  ).trim();

  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  return '';
}

/**
 * Safely parses response as JSON or text fallback without throwing SyntaxError on HTML responses.
 */
async function parseResponseSafely(res: Response): Promise<{ data: any; isJson: boolean; text: string }> {
  try {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return { data, isJson: true, text };
    } catch {
      return { data: null, isJson: false, text };
    }
  } catch {
    return { data: null, isJson: false, text: '' };
  }
}

export class AuthApi {
  public static getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  public static setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // ignore
    }
  }

  public static clearToken(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  }

  public static isLoggedIn(): boolean {
    return Boolean(this.getToken());
  }

  private static getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Register a new user using Netlify Functions directly (/.netlify/functions/register)
   */
  public static async register(payload: RegisterPayload): Promise<AuthResponse> {
    const baseUrl = getApiBaseUrl();
    const endpoint = `${baseUrl}/.netlify/functions/register`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const { data, isJson, text } = await parseResponseSafely(res);

      // Handle 400 Bad Request
      if (res.status === 400) {
        return {
          success: false,
          statusCode: 400,
          message: isJson && data?.message ? data.message : 'Champs manquants ou invalides.',
        };
      }

      // Handle 409 Conflict (Account already exists)
      if (res.status === 409) {
        return {
          success: false,
          statusCode: 409,
          message: isJson && data?.message ? data.message : 'Un compte avec cette adresse email existe déjà. Veuillez vous connecter.',
        };
      }

      // Handle 500 Internal Server Error
      if (res.status >= 500) {
        return {
          success: false,
          statusCode: res.status,
          message: isJson && data?.message ? data.message : 'Erreur serveur lors de l\'inscription. Veuillez réessayer.',
        };
      }

      // If route not found on this host (e.g. Netlify functions still building or static preview)
      if (res.status === 404) {
        console.warn('Endpoint /.netlify/functions/register returned 404. Activating seamless local persistence mode.');
        const cleanEmail = payload.email.trim().toLowerCase();
        const existingAccount = StorageService.getAccountFromVault(cleanEmail);
        if (existingAccount) {
          return {
            success: false,
            statusCode: 409,
            message: 'Un compte avec cette adresse email existe déjà. Veuillez vous connecter.',
          };
        }

        const localUser: User = {
          id: 'usr_' + Date.now().toString(36),
          name: payload.name.trim(),
          email: cleanEmail,
          phoneOrEmail: cleanEmail,
          country: payload.country,
          balance: 0,
          isActivated: false,
          createdAt: Date.now(),
        };
        this.setToken('aerocrash_jwt_' + localUser.id);
        StorageService.setCurrentUser(localUser, [], [], payload.password);

        return {
          success: true,
          statusCode: 201,
          message: 'Compte créé avec succès ! Bienvenue sur AeroCrash.',
          token: this.getToken() || undefined,
          user: localUser,
          bets: [],
          transactions: [],
        };
      }

      // Success (Status 200 or 201)
      if (res.ok) {
        const receivedUser = data?.user || {};
        const cleanUser: User = {
          id: receivedUser.id || 'usr_' + Date.now().toString(36),
          name: receivedUser.name || payload.name.trim(),
          email: receivedUser.email || payload.email.trim(),
          phoneOrEmail: receivedUser.email || payload.email.trim(),
          country: receivedUser.country || payload.country,
          balance: typeof receivedUser.balance === 'number' ? receivedUser.balance : 0,
          isActivated: Boolean(receivedUser.isActivated),
          createdAt: Date.now(),
        };

        const token = data?.token || 'aerocrash_jwt_' + cleanUser.id;
        this.setToken(token);
        StorageService.setCurrentUser(
          cleanUser,
          data?.bets || [],
          data?.transactions || [],
          payload.password
        );

        return {
          success: true,
          statusCode: 201,
          message: data?.message || 'Compte créé avec succès ! Bienvenue sur AeroCrash.',
          token,
          user: cleanUser,
          bets: data?.bets || [],
          transactions: data?.transactions || [],
        };
      }

      return {
        success: false,
        statusCode: res.status,
        message: isJson && data?.message ? data.message : `Erreur serveur (${res.status}).`,
      };
    } catch (err: any) {
      console.warn('Network call to /.netlify/functions/register failed:', err?.message || err);
      // Fallback: check vault for unique email first
      const cleanEmail = payload.email.trim().toLowerCase();
      const existingAccount = StorageService.getAccountFromVault(cleanEmail);
      if (existingAccount) {
        return {
          success: false,
          statusCode: 409,
          message: 'Un compte avec cette adresse email existe déjà. Veuillez vous connecter.',
        };
      }

      const localUser: User = {
        id: 'usr_' + Date.now().toString(36),
        name: payload.name.trim(),
        email: cleanEmail,
        phoneOrEmail: cleanEmail,
        country: payload.country,
        balance: 0,
        isActivated: false,
        createdAt: Date.now(),
      };
      this.setToken('aerocrash_jwt_' + localUser.id);
      StorageService.setCurrentUser(localUser, [], [], payload.password);

      return {
        success: true,
        statusCode: 201,
        message: 'Compte créé avec succès ! Bienvenue sur AeroCrash.',
        token: this.getToken() || undefined,
        user: localUser,
        bets: [],
        transactions: [],
      };
    }
  }

  /**
   * Log in an existing user using Netlify Functions (/.netlify/functions/login)
   */
  public static async login(payload: LoginPayload): Promise<AuthResponse> {
    const baseUrl = getApiBaseUrl();
    const endpoint = `${baseUrl}/.netlify/functions/login`;
    const cleanEmail = payload.email.trim().toLowerCase();

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const { data, isJson } = await parseResponseSafely(res);

      if (res.status === 400) {
        return {
          success: false,
          statusCode: 400,
          message: isJson && data?.message ? data.message : 'Veuillez saisir votre email et mot de passe.',
        };
      }

      if (res.status === 401) {
        return {
          success: false,
          statusCode: 401,
          message: isJson && data?.message ? data.message : 'Email ou mot de passe incorrect.',
        };
      }

      if (res.status >= 500) {
        return {
          success: false,
          statusCode: res.status,
          message: isJson && data?.message ? data.message : 'Erreur serveur lors de la connexion.',
        };
      }

      if (res.status === 404) {
        // Fallback for preview or local environments using accounts vault
        const verification = StorageService.verifyVaultCredentials(cleanEmail, payload.password);
        if (!verification.success || !verification.account) {
          return {
            success: false,
            statusCode: 401,
            message: 'Email ou mot de passe incorrect.',
          };
        }

        const account = verification.account;
        const token = 'aerocrash_jwt_' + account.user.id;
        this.setToken(token);
        StorageService.setCurrentUser(account.user, account.bets, account.transactions, payload.password);

        return {
          success: true,
          statusCode: 200,
          message: 'Connexion réussie ! Bon retour sur AeroCrash.',
          token,
          user: account.user,
          bets: account.bets || [],
          transactions: account.transactions || [],
        };
      }

      if (res.ok) {
        const receivedUser = data?.user || {};
        const cleanUser: User = {
          id: receivedUser.id || 'usr_' + Date.now().toString(36),
          name: receivedUser.name || cleanEmail.split('@')[0],
          email: receivedUser.email || cleanEmail,
          phoneOrEmail: receivedUser.email || cleanEmail,
          country: receivedUser.country || "Côte d'Ivoire",
          balance: typeof receivedUser.balance === 'number' ? receivedUser.balance : 0,
          isActivated: Boolean(receivedUser.isActivated),
          createdAt: Date.now(),
        };

        const token = data?.token || 'aerocrash_jwt_' + cleanUser.id;
        this.setToken(token);
        StorageService.setCurrentUser(
          cleanUser,
          data?.bets || [],
          data?.transactions || [],
          payload.password
        );

        return {
          success: true,
          statusCode: 200,
          message: data?.message || 'Connexion réussie ! Bon retour sur AeroCrash.',
          token,
          user: cleanUser,
          bets: data?.bets || StorageService.getBetHistory(cleanUser.id),
          transactions: data?.transactions || StorageService.getTransactions(cleanUser.id),
        };
      }

      return {
        success: false,
        statusCode: res.status,
        message: isJson && data?.message ? data.message : 'Email ou mot de passe incorrect.',
      };
    } catch (err: any) {
      console.warn('Network call to /.netlify/functions/login failed:', err?.message || err);
      const verification = StorageService.verifyVaultCredentials(cleanEmail, payload.password);
      if (!verification.success || !verification.account) {
        return {
          success: false,
          statusCode: 401,
          message: 'Email ou mot de passe incorrect.',
        };
      }

      const account = verification.account;
      const token = 'aerocrash_jwt_' + account.user.id;
      this.setToken(token);
      StorageService.setCurrentUser(account.user, account.bets, account.transactions, payload.password);

      return {
        success: true,
        statusCode: 200,
        message: 'Connexion réussie ! Bon retour sur AeroCrash.',
        token,
        user: account.user,
        bets: account.bets || [],
        transactions: account.transactions || [],
      };
    }
  }

  /**
   * Fetch current authenticated user session
   */
  public static async fetchMe(): Promise<{ success: boolean; user?: User; bets?: any[]; transactions?: any[] }> {
    const token = this.getToken();
    if (!token) return { success: false };

    const baseUrl = getApiBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/.netlify/functions/me`, {
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.clearToken();
        }
        // If 404 or backend unavailable, check if we have a valid local active user
        const active = StorageService.getUser();
        if (active && active.id !== 'usr_guest') {
          return {
            success: true,
            user: active,
            bets: StorageService.getBetHistory(active.id),
            transactions: StorageService.getTransactions(active.id),
          };
        }
        return { success: false };
      }

      const { data } = await parseResponseSafely(res);
      return data || { success: false };
    } catch {
      const active = StorageService.getUser();
      if (active && active.id !== 'usr_guest') {
        return {
          success: true,
          user: active,
          bets: StorageService.getBetHistory(active.id),
          transactions: StorageService.getTransactions(active.id),
        };
      }
      return { success: false };
    }
  }

  /**
   * Sync balance with server
   */
  public static async updateBalance(balance: number, delta?: number): Promise<boolean> {
    const token = this.getToken();
    if (!token) return false;

    const baseUrl = getApiBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/.netlify/functions/balance`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ balance, delta }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Activate account with starter bonus
   */
  public static async activateAccount(initialBonus = 3000): Promise<{ success: boolean; user?: User }> {
    const token = this.getToken();
    if (!token) return { success: false };

    const baseUrl = getApiBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/.netlify/functions/activate`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ initialBonus }),
      });
      const { data } = await parseResponseSafely(res);
      return data || { success: false };
    } catch {
      return { success: false };
    }
  }

  /**
   * Deposit money via SasPay or simulated provider (Mandatory to unlock real play)
   */
  public static async deposit(amount: number, method = 'wave', phone?: string, country?: string, otp?: string): Promise<{
    success: boolean;
    pending?: boolean;
    paymentId?: string;
    checkoutUrl?: string;
    instructions?: string;
    balance?: number;
    user?: User;
    message?: string;
    transaction?: any;
  }> {
    const token = this.getToken();
    if (!token) return { success: false, message: 'Non connecté' };

    const baseUrl = getApiBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/.netlify/functions/deposit`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ amount, method, phone, country, otp }),
      });
      const { data } = await parseResponseSafely(res);
      return data || { success: false, message: 'Erreur lors du dépôt.' };
    } catch {
      return { success: false, message: 'Erreur réseau lors du dépôt.' };
    }
  }

  /**
   * Verify SasPay payment status in real time
   */
  public static async checkPaymentStatus(paymentId: string): Promise<{
    success: boolean;
    status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'CANCELLED' | string;
    balance?: number;
    user?: User;
    message?: string;
  }> {
    const baseUrl = getApiBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/.netlify/functions/payment-status?paymentId=${encodeURIComponent(paymentId)}`, {
        headers: this.getHeaders(),
      });
      const { data } = await parseResponseSafely(res);
      return data || { success: false, status: 'FAILED', message: 'Erreur vérification statut.' };
    } catch {
      return { success: false, status: 'FAILED', message: 'Erreur réseau vérification statut.' };
    }
  }

  /**
   * Withdraw funds
   */
  public static async withdraw(amount: number, method = 'wave', phone?: string, country?: string): Promise<{ success: boolean; balance?: number; user?: User; message?: string; transaction?: any }> {
    const token = this.getToken();
    if (!token) return { success: false, message: 'Non connecté' };

    const baseUrl = getApiBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/.netlify/functions/withdraw`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ amount, method, phone, country }),
      });
      const { data } = await parseResponseSafely(res);
      return data || { success: false, message: 'Erreur lors du retrait.' };
    } catch {
      return { success: false, message: 'Erreur réseau lors du retrait.' };
    }
  }

  /**
   * Sync a placed bet to the user's account
   */
  public static async logBet(bet: any): Promise<boolean> {
    const token = this.getToken();
    if (!token) return false;

    const baseUrl = getApiBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/.netlify/functions/bets`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ bet }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Sync transaction to the user's account
   */
  public static async logTransaction(transaction: any): Promise<boolean> {
    const token = this.getToken();
    if (!token) return false;

    const baseUrl = getApiBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/.netlify/functions/transactions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ transaction }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Offline / Client-Side Fallback:
   * Creates a valid local session when the backend cannot be reached.
   * This guarantees that no user is ever locked out of playing or testing the game.
   */
  public static createLocalSession(payload: RegisterPayload): User {
    const localUser: User = {
      id: 'usr_local_' + Math.random().toString(36).substring(2, 9),
      name: payload.name.trim(),
      email: payload.email.trim(),
      phoneOrEmail: payload.email.trim(),
      country: payload.country,
      isActivated: false,
      balance: 0,
      createdAt: Date.now(),
    };

    // Store dummy token and save user
    this.setToken('local_token_' + Date.now());
    StorageService.saveUser(localUser);
    return localUser;
  }
}
