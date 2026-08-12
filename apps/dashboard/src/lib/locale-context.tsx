"use client";

import { createContext, useContext, type ReactNode } from "react";

import { getLocale, type Locale } from "@sm-bot/shared";

const LocaleContext = createContext<Locale>(getLocale("ja"));

export function LocaleProvider({
  value,
  children
}: {
  value: Locale;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
