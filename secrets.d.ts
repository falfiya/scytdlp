/**
 * Sorry about the mixed case!
 * These are all used quite differently so I wanted to make that apparent.
 */
type SecretsFile = {
   /** Authorization header */
   Authorization: `OAuth 2-${string}`;
   /** Query Parameter */
   client_id: string;
   /** For API Path `users/{userID}` */
   userID: string;
}

export default SecretsFile;
