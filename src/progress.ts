/**
 * Progress bar estimation for units.
 * In practice, a unit is a download.
 */
export class Progress {
   profiled: number;
   profiledTime: number;

   nonprofiled: number;

   constructor (public total: number) {
      this.profiled = 0;
      this.profiledTime = 0;
      this.nonprofiled = 0;
   }

   bump() {
      this.nonprofiled++;
   }

   startProfile(): number {
      return process.hrtime()[0];
   }

   endProfile(start: number) {
      const end = process.hrtime()[0];
      this.profiled++;
      this.profiledTime += end - start;
   }

   toString(): string {
      const averageTimePerUnit = this.profiledTime / this.profiled;
      const reminaing = this.total - this.profiled - this.nonprofiled;

      if (reminaing === 0) {
         return "0s";
      }

      let secondsLeft = averageTimePerUnit * reminaing;

      const hours = secondsLeft / 3600 | 0;
      secondsLeft %= 3600;
      const minutes = secondsLeft / 60 | 0;
      secondsLeft %= 60;

      if (hours === 0) {
         if (minutes === 0) {
            return `${secondsLeft}s`;
         }

         if (minutes === 1) {
            return "1m";
         }

         return `${minutes} minutes`;
      }

      if (minutes === 0) {
         if (hours === 1) {
            return "1h";
         }

         return `${hours}h 0m`;
      }

      if (minutes === 1) {
         if (hours === 1) {
            return "1h 1m";
         }

         return `${hours}h 1m`;
      }

      return `${hours}h ${minutes}m`;
   }
}
