# Migrations

Non-backwards compatible changes in data format happen from time to time.

1. Create a new migration file `yyyy-mm-dd_description.ts` using the template.
2. Describe the changes made in the migration file.
3. Bump the version.

### Template:

```
/**************************************************************************************************
New Version:               
Last Compatible Commit:    
Last Compatible Version:   
Rollbackable:              Yes / No

Reason:
   Your reasoning here.
***************************************************************************************************/
```
