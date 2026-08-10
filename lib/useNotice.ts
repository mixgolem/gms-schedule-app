"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useNotice() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const instanceId = useId();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("notice").select("content").eq("id", 1).maybeSingle();
    setContent(data?.content ?? "");
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`notice-changes-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notice" }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, instanceId]);

  const updateNotice = useCallback(async (newContent: string) => {
    const { error } = await supabase
      .from("notice")
      .update({ content: newContent, updated_at: new Date().toISOString() })
      .eq("id", 1);
    await fetchData();
    return { error };
  }, [fetchData]);

  return { content, loading, updateNotice };
}
