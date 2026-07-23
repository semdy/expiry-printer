/// <reference types="vite/client" />

declare global {
  function t(id: string): string;
  function t(id: string, defaultMessage: string): string;
  function t(id: string, values: Record<string, any>): string;
  function t(id: string, defaultMessage: string, values: Record<string, any>): string;
}

export {};
