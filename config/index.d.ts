export type Config = {
   OUTPUT: string;
   DEBOUNCE_MS: number;
   LOG_LEVEL: 0 | 1 | 2;
   USE_ARCHIVED_AS_CACHE: boolean;
};

export type Secrets = {
   /** `Authorization` header */
   authorization: `OAuth 2-${string}`;
   /** Query Parameter */
   clientID?: string;
   /** For API Path `users/{userID}` */
   userID: string;
};
