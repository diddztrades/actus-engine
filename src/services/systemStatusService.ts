import { hasSupabaseEnv, supabase } from "./supabaseClient";

export async function getSystemStatus(): Promise<{
  connection: "online" | "offline";
  dataSource: "supabase" | "local";
}> {
  if (!hasSupabaseEnv || !supabase) {
    return {
      connection: "offline",
      dataSource: "local"
    };
  }

  const { error } = await supabase.from("macro_snapshots").select("id").limit(1);

  return {
    connection: error ? "offline" : "online",
    dataSource: error ? "local" : "supabase"
  };
}