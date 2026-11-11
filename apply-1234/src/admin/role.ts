import { createContext, useContext } from 'react';

/** admin: the hiring team, everything. editor: full access to the jobs they were given, nothing else. */
export type Role = 'admin' | 'editor';
export const RoleContext = createContext<Role>('admin');
export const useRole = () => useContext(RoleContext);
