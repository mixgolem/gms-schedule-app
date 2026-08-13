"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { debounce } from "@/lib/debounce";

export function useNotice() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const instanceId = useId();
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const { data } = await supabase.from("notice").select("content").eq("id", 1).maybeSingle();
    if (requestId !== requestIdRef.current) return;
    setContent(data?.content ?? "");
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const debounced = debounce(fetchData, 300);
    const channel = supabase
      .channel(`notice-changes-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notice" }, () => {
        debounced.run();
      })
      .subscribe();

    return () => {
      debounced.cancel();
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
