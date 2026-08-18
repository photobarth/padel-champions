"use client";

import { useCallback, useEffect, useState } from "react";

function readAdminCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.trim() === "padel_admin=1");
}

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(readAdminCookie());
  }, []);

  const logout = useCallback(() => {
    document.cookie = "padel_admin=; Max-Age=0; path=/";
    setIsAdmin(false);
  }, []);

  return { isAdmin, logout };
}
