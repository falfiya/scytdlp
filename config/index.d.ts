export type Config = {
   DEBOUNCE_MS: number;
   LOG_LEVEL: 0 | 1 | 2;
};

export type Secrets = {
   /** `Authorization` header */
   authorization: `OAuth 2-${string}`;
   /** Query Parameter */
   clientID?: string;
   /** For API Path `users/{userID}` */
   userID: string;
};
