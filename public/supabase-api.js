export const isSupabaseConfigured = false;

export async function supabaseApi() {
  throw new Error("Acesso direto ao Supabase foi desativado. Use as rotas /api do servidor.");
}
