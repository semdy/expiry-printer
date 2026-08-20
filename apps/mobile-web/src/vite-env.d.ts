/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

declare global {
  const process: {
    env: {
      NODE_ENV?: string;
      REACT_APP_DOMAIN?: string;
      REACT_APP_ENV?: string;
    };
  };

  function t(id: string): string;
  function t(id: string, defaultMessage: string): string;
  function t(id: string, values: Record<string, any>): string;
  function t(id: string, defaultMessage: string, values: Record<string, any>): string;
}

export {};
