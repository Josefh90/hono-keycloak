export interface UserContext {
  userId: string;
  email: string;
  roles: string[];
}

/** Hono type parameter for apps that use validateJwt middleware. */
export type AuthVariables = {
  user: UserContext;
};
