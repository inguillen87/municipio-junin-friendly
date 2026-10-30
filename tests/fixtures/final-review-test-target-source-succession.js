// Closed finite source succession. No whitespace, timeout or generic normalizer.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const FINAL_REVIEW_TEST_SOURCE_SUCCESSION=
[
  {
    "path": "scripts/lib/final-grh-source-review-admission-installation.mjs",
    "beforeSha256": "e45a31bfc85ea3436a627aab2173a2dd21545304075cfb10a38777316946367d",
    "beforeBytes": 27812,
    "afterSha256": "b32a0bf3ce629ee9a492adeee067076a0e625b304ddcf63de0dd2230488307d5",
    "afterBytes": 29252,
    "operations": [
      {
        "beforeBase64": "aW1wb3J0IHtPV05fUkVMRUFTRV9UQVJHRVRTfSBmcm9tICcuL293bi1wYXlyb2xsLXJlbGVhc2UtdGFyZ2V0Lm1qcyc7",
        "afterBase64": "aW1wb3J0IHtPV05fUkVMRUFTRV9UQVJHRVRTfSBmcm9tICcuL293bi1wYXlyb2xsLXJlbGVhc2UtdGFyZ2V0Lm1qcyc7CmltcG9ydCB7cmVxdWlyZUZpbmFsUmV2aWV3VGVzdFRhcmdldEFkbWlzc2lvbn0gZnJvbSAnLi9maW5hbC1ncmgtc291cmNlLXJldmlldy10ZXN0LXRhcmdldC1hZG1pc3Npb24ubWpzJzs="
      },
      {
        "beforeBase64": "Y29uc3Qgc291cmNlUGlucz1PYmplY3QuZnJlZXplKHs=",
        "afterBase64": "Y29uc3Qgc291cmNlUGlucz1PYmplY3QuZnJlZXplKHsKICdzY3JpcHRzL2xpYi9maW5hbC1ncmgtc291cmNlLXJldmlldy10ZXN0LXRhcmdldC1hZG1pc3Npb24ubWpzJzonY2Q4ZTI3NTlkZWMwY2RhZDUzN2IzYWU5MWY3NzBmY2M4ODU4NjM2YzA0OWY2OGFlMzJjYjM2NTI0NmU4YTQ3Yics"
      },
      {
        "beforeBase64": "ZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRmluYWxHcmhTb3VyY2VSZXZpZXdBZG1pc3Npb25JbnN0YWxsYXRpb24oe3JlYWQsc291cmNlQ29tbWl0LG1ham9yfSl7",
        "afterBase64": "Ly8gUHJvZHVjdGlvbiByZW1haW5zIHNlbGVjdGVkIHNvbGVseSBmcm9tIHRoZSBleGlzdGluZyByZWxlYXNlIGNhdGFsb2d1ZS4KZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRmluYWxHcmhTb3VyY2VSZXZpZXdBZG1pc3Npb25JbnN0YWxsYXRpb24oe3JlYWQsc291cmNlQ29tbWl0LG1ham9yfSl7CiByZXR1cm4gYnVpbGRGaW5hbFJldmlld0FkbWlzc2lvbkF0VGFyZ2V0KHtyZWFkLHNvdXJjZUNvbW1pdCxtYWpvcn0sT1dOX1JFTEVBU0VfVEFSR0VUUy5maW5kKHQ9PnQubWFqb3I9PT1tYWpvciksbWFqb3I9PT0xNz8xNjM5NToxNjM5NixudWxsKTsKfQovLyBOZXcgVEVTVCBjb25zdHJ1Y3Rpb24gc3RhcnRzIHdpdGggYSBzZXBhcmF0ZWx5IHZhbGlkYXRlZCBURVNUIHRhcmdldC4gSXQgbmV2ZXIKLy8gY29uc3RydWN0cyBhIFByb2R1Y3Rpb24gcGxhbiwgcmV0YXJnZXRzIGEgbWludGVkIHBsYW4gb3IgZXhwb3NlcyBhbjE4MyBwcm90b2NvbC4KZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRmluYWxHcmhTb3VyY2VSZXZpZXdBZG1pc3Npb25UZXN0UHJlcmVxdWlzaXRlKHtyZWFkLHNvdXJjZUNvbW1pdCx0ZXN0VGFyZ2V0QWRtaXNzaW9ufSl7CiBjb25zdCBzY29wZT1yZXF1aXJlRmluYWxSZXZpZXdUZXN0VGFyZ2V0QWRtaXNzaW9uKHRlc3RUYXJnZXRBZG1pc3Npb24se3NvdXJjZUNvbW1pdH0pOwogcmV0dXJuIGJ1aWxkRmluYWxSZXZpZXdBZG1pc3Npb25BdFRhcmdldCh7cmVhZCxzb3VyY2VDb21taXQsbWFqb3I6c2NvcGUudGFyZ2V0Lm1ham9yfSxzY29wZS50YXJnZXQsc2NvcGUudGFyZ2V0LmRhdGFiYXNlT2lkLHNjb3BlKTsKfQpmdW5jdGlvbiBidWlsZEZpbmFsUmV2aWV3QWRtaXNzaW9uQXRUYXJnZXQoe3JlYWQsc291cmNlQ29tbWl0LG1ham9yfSx0YXJnZXQsZGF0YWJhc2VPaWQsdGVzdFNjb3BlKXs="
      },
      {
        "beforeBase64": "Y29uc3Qgc291cmNlUHJlcmVxdWlzaXRlPWZpbmFsU291cmNlUHJlcmVxdWlzaXRlKHJlYWQpLHRhcmdldD1PV05fUkVMRUFTRV9UQVJHRVRTLmZpbmQodD0+dC5tYWpvcj09PW1ham9yKTthc3NlcnQuZXF1YWwoc291cmNlUHJlcmVxdWlzaXRlLnBpbnMubGVuZ3RoLDkpOw==",
        "afterBase64": "Y29uc3Qgc291cmNlUHJlcmVxdWlzaXRlPWZpbmFsU291cmNlUHJlcmVxdWlzaXRlKHJlYWQpO2Fzc2VydC5lcXVhbChzb3VyY2VQcmVyZXF1aXNpdGUucGlucy5sZW5ndGgsOSk7YXNzZXJ0Lm9rKHRhcmdldCYmdGFyZ2V0Lm1ham9yPT09bWFqb3IpO2Fzc2VydC5vayhOdW1iZXIuaXNTYWZlSW50ZWdlcihkYXRhYmFzZU9pZCkmJmRhdGFiYXNlT2lkPjApOw=="
      },
      {
        "beforeBase64": "PD4ke21ham9yPT09MTc/MTYzOTU6MTYzOTZ9OjpvaWQgVEhFTiBSQUlTRSBFWENFUFRJT04gJ0ZJTkFMX1JFVklFV19EQVRBQkFTRV9PSUQnO0VORCBJRjtFTkQgJGRlc3RpbmF0aW9uJGApOw==",
        "afterBase64": "PD4ke2RhdGFiYXNlT2lkfTo6b2lkIFRIRU4gUkFJU0UgRVhDRVBUSU9OICdGSU5BTF9SRVZJRVdfREFUQUJBU0VfT0lEJztFTkQgSUY7JHt0ZXN0U2NvcGU/YElGIHNlc3Npb25fdXNlcjw+JHtxKHRhcmdldC5yb2xlKX0gVEhFTiBSQUlTRSBFWENFUFRJT04gJ0ZJTkFMX1JFVklFV19URVNUX1NFU1NJT05fVVNFUic7RU5EIElGO2A6Jyd9RU5EICRkZXN0aW5hdGlvbiRgKTs="
      },
      {
        "beforeBase64": "IGNvbnN0IGZpbmdlcnByaW50PXNsb3Q9Pg==",
        "afterBase64": "IGlmKHRlc3RTY29wZSlyZXR1cm57dmVyc2lvbjonZmluYWwtZ3JoLXNvdXJjZS1yZXZpZXctdGVzdC1wcmVyZXF1aXNpdGUudjEnLHNvdXJjZUNvbW1pdCxtYWpvcix0YXJnZXQsc291cmNlSGFzaGVzLHJlZ2lzdHJ5Q3VzdG9keSxzb3VyY2VQcmVyZXF1aXNpdGUsc2V0dGluZ3MsZGVzdGluYXRpb24sYmVmb3JlLGFmdGVyLGZpbmFsLGF1ZGl0LGNvbm5lY3RzOmZhbHNlLGV4ZWN1dGVzU3FsOmZhbHNlfTsKIGNvbnN0IGZpbmdlcnByaW50PXNsb3Q9Pg=="
      }
    ]
  },
  {
    "path": "scripts/lib/final-grh-source-review-admission-october28-installation.mjs",
    "beforeSha256": "4cd2faf2c5fb1e28f58818fbbcacd9052bd77ed544c940eb65d8c376312b7b6a",
    "beforeBytes": 19819,
    "afterSha256": "48e917ec897ee71364b82b824c44293f7bee47fa755f8ec1c1f92fd18b6eae7f",
    "afterBytes": 23067,
    "operations": [
      {
        "beforeBase64": "Ly8gSXQgY29tcG9zZXMgb24gdG9wIG9mIHRoZSB1bmNoYW5nZWQgMTgzIGNvbnN0cnVjdG9yIChwb3N0LUMgbWV0YWRhdGEgZTQ1YeKApiwgcGFyZW50IDUwNDbigKYpIGFuZCBuZXZlciBlZGl0cyw=",
        "afterBase64": "Ly8gSXQgY29tcG9zZXMgb24gdGhlIHNoYXJlZDE4MyBzb3VyY2UgY29uc3RydWN0b3IgKHdpdGggZmluaXRlIFRFU1Qtc291cmNlIHN1Y2Nlc3Npb24pIGFuZCBuZXZlciBlZGl0cyw="
      },
      {
        "beforeBase64": "aW1wb3J0IHtidWlsZEZpbmFsR3JoU291cmNlUmV2aWV3QWRtaXNzaW9uSW5zdGFsbGF0aW9uLEZJTkFMX1JFVklFV19BRE1JU1NJT05fRklMRQ==",
        "afterBase64": "aW1wb3J0IHtidWlsZEZpbmFsR3JoU291cmNlUmV2aWV3QWRtaXNzaW9uSW5zdGFsbGF0aW9uLGJ1aWxkRmluYWxHcmhTb3VyY2VSZXZpZXdBZG1pc3Npb25UZXN0UHJlcmVxdWlzaXRlLEZJTkFMX1JFVklFV19BRE1JU1NJT05fRklMRQ=="
      },
      {
        "beforeBase64": "aW1wb3J0IHtwcm9qZWN0T2N0b2JlcjI4UmVnaXN0cnlQYXJlbnR9IGZyb20gJy4vZ3JoLW9jdG9iZXIyOC1jYW5kaWRhdGUtcmVnaXN0cnktc291cmNlLm1qcyc7",
        "afterBase64": "aW1wb3J0IHtwcm9qZWN0T2N0b2JlcjI4UmVnaXN0cnlQYXJlbnR9IGZyb20gJy4vZ3JoLW9jdG9iZXIyOC1jYW5kaWRhdGUtcmVnaXN0cnktc291cmNlLm1qcyc7CmltcG9ydCB7cmVxdWlyZUZpbmFsUmV2aWV3VGVzdFRhcmdldEFkbWlzc2lvbn0gZnJvbSAnLi9maW5hbC1ncmgtc291cmNlLXJldmlldy10ZXN0LXRhcmdldC1hZG1pc3Npb24ubWpzJzs="
      },
      {
        "beforeBase64": "Ly8gMTgzIG1vZHVsZSBlNDVh4oCmIC0+IHBhcmVudCA1MDQ24oCmIChDIGZpbml0ZSBpbnZlcnNlIGZpeHR1cmUgZjNiOeKApik7IHJlZ2lzdHJ5IGZlMDTigKYgLT4gcGFyZW50IGNkMTIx4oCmIChCIGhlbHBlciA2OTBh4oCmKS4=",
        "afterBase64": "Ly8gU2hhcmVkMTgzIG1vZHVsZSAtPiBlNDVh4oCmIChmaW5pdGUgVEVTVCBmaXh0dXJlKSAtPiA1MDQ24oCmICh1bmNoYW5nZWQgQyBmaXh0dXJlKTsgcmVnaXN0cnkgZmUwNOKApiAtPiBjZDEyMeKApi4="
      },
      {
        "beforeBase64": "ICdzY3JpcHRzL2xpYi9maW5hbC1ncmgtc291cmNlLXJldmlldy1hZG1pc3Npb24taW5zdGFsbGF0aW9uLm1qcyc6J2U0NWEzMWJmYzg1ZWEzNDM2YTYyN2FhYjIxNzNhMmRkMjE1NDUzMDQwNzVjZmIxMGEzODc3NzMxNjk0NjM2N2QnLA==",
        "afterBase64": "ICdzY3JpcHRzL2xpYi9maW5hbC1ncmgtc291cmNlLXJldmlldy1hZG1pc3Npb24taW5zdGFsbGF0aW9uLm1qcyc6J2IzMmEwYmYzY2U2MjllZTlhNDkyYWRlZWUwNjcwNzZhMGU2MjViMzA0ZGRjZjYzZGUwZGQyMjMwNDg4MzA3ZDUnLAogJ3NjcmlwdHMvbGliL2ZpbmFsLWdyaC1zb3VyY2UtcmV2aWV3LXRlc3QtdGFyZ2V0LWFkbWlzc2lvbi5tanMnOidjZDhlMjc1OWRlYzBjZGFkNTM3YjNhZTkxZjc3MGZjYzg4NTg2MzZjMDQ5ZjY4YWUzMmNiMzY1MjQ2ZThhNDdiJyw="
      },
      {
        "beforeBase64": "ZXhwb3J0IGNvbnN0IE9DVDI4X1BST09GX1ZFUlNJT049J2ZpbmFsLWdyaC1zb3VyY2UtcmV2aWV3LWFkbWlzc2lvbi1vY3RvYmVyMjgudjMnOw==",
        "afterBase64": "ZXhwb3J0IGNvbnN0IE9DVDI4X1BST09GX1ZFUlNJT049J2ZpbmFsLWdyaC1zb3VyY2UtcmV2aWV3LWFkbWlzc2lvbi1vY3RvYmVyMjgudjMnOwpleHBvcnQgY29uc3QgT0NUMjhfVEVTVF9QUk9PRl9WRVJTSU9OPSdmaW5hbC1ncmgtc291cmNlLXJldmlldy1hZG1pc3Npb24tb2N0b2JlcjI4LnYzK3Rlc3QnOwpjb25zdCBURVNUX1BST09GX0tFWVM9T2JqZWN0LmZyZWV6ZShbJ3RhcmdldEtpbmQnLCdwcm9qZWN0SWQnLCdicmFuY2hJZCcsJ2VuZHBvaW50SWQnLCdkYXRhYmFzZScsJ2RhdGFiYXNlT2lkJywnZ3VhcmRPaWQnLCdzZXJ2ZXJNYWpvcicsJ2N1cnJlbnRVc2VyJywnc2Vzc2lvblVzZXInLCd0ZXN0VGFyZ2V0T2JzZXJ2YXRpb25TaGEyNTYnLCd0ZXN0VGFyZ2V0T2JzZXJ2YXRpb25Tb3VyY2VDb21taXQnXSk7"
      },
      {
        "beforeBase64": "ZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRmluYWxHcmhTb3VyY2VSZXZpZXdBZG1pc3Npb25PY3RvYmVyMjgoe3JlYWQsc291cmNlQ29tbWl0LG1ham9yfSl7",
        "afterBase64": "ZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRmluYWxHcmhTb3VyY2VSZXZpZXdBZG1pc3Npb25PY3RvYmVyMjgob3B0aW9ucyl7cmV0dXJuIGJ1aWxkT2N0b2JlcjI4Rm9yU2NvcGUob3B0aW9ucyxudWxsKTt9CmV4cG9ydCBmdW5jdGlvbiBidWlsZEZpbmFsR3JoU291cmNlUmV2aWV3QWRtaXNzaW9uT2N0b2JlcjI4VGVzdCh7cmVhZCxzb3VyY2VDb21taXQsdGVzdFRhcmdldEFkbWlzc2lvbn0pewogY29uc3Qgc2NvcGU9cmVxdWlyZUZpbmFsUmV2aWV3VGVzdFRhcmdldEFkbWlzc2lvbih0ZXN0VGFyZ2V0QWRtaXNzaW9uLHtzb3VyY2VDb21taXR9KTsKIHJldHVybiBidWlsZE9jdG9iZXIyOEZvclNjb3BlKHtyZWFkLHNvdXJjZUNvbW1pdCxtYWpvcjpzY29wZS50YXJnZXQubWFqb3IsdGVzdFRhcmdldEFkbWlzc2lvbn0sc2NvcGUpOwp9CmZ1bmN0aW9uIGJ1aWxkT2N0b2JlcjI4Rm9yU2NvcGUoe3JlYWQsc291cmNlQ29tbWl0LG1ham9yLHRlc3RUYXJnZXRBZG1pc3Npb259LHRlc3RTY29wZSl7"
      },
      {
        "beforeBase64": "Ly8gVGhlIHVuY2hhbmdlZCAxODMgY29uc3RydWN0b3IgcmUtY2hlY2tzIDE0NCwgaXRzIHByZXJlcXVpc2l0ZXMsIHJlZ2lzdHJ5IGN1c3RvZHkgYW5kIHRoZSB0d28gaGlzdG9yaWNhbCB0dXBsZXMu",
        "afterBase64": "Ly8gVGhlIHNoYXJlZDE4MyBjb25zdHJ1Y3RvciByZS1jaGVja3MxNDQsIGl0cyBwcmVyZXF1aXNpdGVzLCByZWdpc3RyeSBjdXN0b2R5IGFuZCBib3RoIGhpc3RvcmljYWwgdHVwbGVzLg=="
      },
      {
        "beforeBase64": "IGNvbnN0IGJhc2U9YnVpbGRGaW5hbEdyaFNvdXJjZVJldmlld0FkbWlzc2lvbkluc3RhbGxhdGlvbih7cmVhZCxzb3VyY2VDb21taXQsbWFqb3J9KTs=",
        "afterBase64": "IGNvbnN0IGJhc2U9dGVzdFNjb3BlP2J1aWxkRmluYWxHcmhTb3VyY2VSZXZpZXdBZG1pc3Npb25UZXN0UHJlcmVxdWlzaXRlKHtyZWFkLHNvdXJjZUNvbW1pdCx0ZXN0VGFyZ2V0QWRtaXNzaW9ufSk6YnVpbGRGaW5hbEdyaFNvdXJjZVJldmlld0FkbWlzc2lvbkluc3RhbGxhdGlvbih7cmVhZCxzb3VyY2VDb21taXQsbWFqb3J9KTs="
      },
      {
        "beforeBase64": "IGNvbnN0IHByb29mPSh0cmFuc2FjdGlvbmFsLGV4cGVjdGVkVHVwbGVTdGF0ZSk9Pg==",
        "afterBase64": "IC8vIE5hdGl2ZSBpZGVudGl0eSBpcyBvYnNlcnZlZCBieSBTUUwuIFRoZXNlIGZpZWxkcyBhcmUgbmV2ZXIgZmFicmljYXRlZCBmcm9tCiAvLyB0YXJnZXQgbGl0ZXJhbHM7IG9ubHkgdGhlIGluZGVwZW5kZW50bHkgcmV2aWV3ZWQgc291cmNlLW9ic2VydmF0aW9uIGRpZ2VzdCBpcyBsaXRlcmFsLgogY29uc3QgdGVzdFByb29mRmllbGRzPXRlc3RTY29wZT9gLCd0YXJnZXRLaW5kJywndGVzdCcsJ3Byb2plY3RJZCcsY3VycmVudF9zZXR0aW5nKCduZW9uLnByb2plY3RfaWQnLHRydWUpLCdicmFuY2hJZCcsY3VycmVudF9zZXR0aW5nKCduZW9uLmJyYW5jaF9pZCcsdHJ1ZSksJ2VuZHBvaW50SWQnLGN1cnJlbnRfc2V0dGluZygnbmVvbi5lbmRwb2ludF9pZCcsdHJ1ZSksJ2RhdGFiYXNlJyxjdXJyZW50X2RhdGFiYXNlKCksJ2RhdGFiYXNlT2lkJywoU0VMRUNUIG9pZDo6YmlnaW50IEZST00gcGdfZGF0YWJhc2UgV0hFUkUgZGF0bmFtZT1jdXJyZW50X2RhdGFiYXNlKCkpLCdndWFyZE9pZCcsdG9fcmVncHJvY2VkdXJlKCdwdWJsaWMubmF0aXZlX2VtcGxveWVlX2NvbnRyYWN0X2d1YXJkX3YxKCknKTo6b2lkOjpiaWdpbnQsJ3NlcnZlck1ham9yJyxjdXJyZW50X3NldHRpbmcoJ3NlcnZlcl92ZXJzaW9uX251bScpOjppbnQvMTAwMDAsJ2N1cnJlbnRVc2VyJyxjdXJyZW50X3VzZXIsJ3Nlc3Npb25Vc2VyJyxzZXNzaW9uX3VzZXIsJ3Rlc3RUYXJnZXRPYnNlcnZhdGlvblNoYTI1NicsJHtxKHRlc3RTY29wZS5vYnNlcnZhdGlvblNoYTI1Nil9LCd0ZXN0VGFyZ2V0T2JzZXJ2YXRpb25Tb3VyY2VDb21taXQnLCR7cSh0ZXN0U2NvcGUub2JzZXJ2YXRpb25Tb3VyY2VDb21taXQpfWA6Jyc7CiBjb25zdCBwcm9vZj0odHJhbnNhY3Rpb25hbCxleHBlY3RlZFR1cGxlU3RhdGUpPT4="
      },
      {
        "beforeBase64": "cShPQ1QyOF9QUk9PRl9WRVJTSU9OKQ==",
        "afterBase64": "cSh0ZXN0U2NvcGU/T0NUMjhfVEVTVF9QUk9PRl9WRVJTSU9OOk9DVDI4X1BST09GX1ZFUlNJT04p"
      },
      {
        "beforeBase64": "J21hbmFnZWRDb25zdHJhaW50U2hhMjU2Jywke2NvbnN0cmFpbnRGaW5nZXJwcmludH0pIEFTIHByb29m",
        "afterBase64": "J21hbmFnZWRDb25zdHJhaW50U2hhMjU2Jywke2NvbnN0cmFpbnRGaW5nZXJwcmludH0ke3Rlc3RQcm9vZkZpZWxkc30pIEFTIHByb29m"
      },
      {
        "beforeBase64": "cmV0dXJue3ZlcnNpb246J2ZpbmFsLWdyaC1zb3VyY2UtcmV2aWV3LWFkbWlzc2lvbi1vY3RvYmVyMjgudjEnLHNvdXJjZUNvbW1pdCxtYWpvcix0YXJnZXQ6YmFzZS50YXJnZXQsc291cmNlSGFzaGVzLHJlZ2lzdHJ5Q3VzdG9keTpiYXNlLnJlZ2lzdHJ5Q3VzdG9keSw=",
        "afterBase64": "cmV0dXJue3ZlcnNpb246dGVzdFNjb3BlPydmaW5hbC1ncmgtc291cmNlLXJldmlldy1hZG1pc3Npb24tb2N0b2JlcjI4LnYxK3Rlc3QnOidmaW5hbC1ncmgtc291cmNlLXJldmlldy1hZG1pc3Npb24tb2N0b2JlcjI4LnYxJywuLi4odGVzdFNjb3BlP3t0ZXN0Q29uc3RydWN0aW9uOnt2ZXJzaW9uOnRlc3RTY29wZS52ZXJzaW9uLHNjb3BlOnRlc3RTY29wZS5zY29wZSxvYnNlcnZhdGlvblNoYTI1Njp0ZXN0U2NvcGUub2JzZXJ2YXRpb25TaGEyNTYsb2JzZXJ2YXRpb25Tb3VyY2VDb21taXQ6dGVzdFNjb3BlLm9ic2VydmF0aW9uU291cmNlQ29tbWl0LG9ic2VydmVkVHVwbGVTdGF0ZTp0ZXN0U2NvcGUub2JzZXJ2ZWRUdXBsZVN0YXRlLGV4ZWN1dGlvbkFkbWl0dGVkOmZhbHNlfX06e30pLHNvdXJjZUNvbW1pdCxtYWpvcix0YXJnZXQ6YmFzZS50YXJnZXQsc291cmNlSGFzaGVzLHJlZ2lzdHJ5Q3VzdG9keTpiYXNlLnJlZ2lzdHJ5Q3VzdG9keSw="
      },
      {
        "beforeBase64": "ZXhwb3J0IGZ1bmN0aW9uIGFzc2VydE9jdG9iZXIyOEFkbWlzc2lvblByb29mKHByb29mLHtsYWJlbCxzb3VyY2VDb21taXQsbWFqb3J9KXs=",
        "afterBase64": "ZXhwb3J0IGZ1bmN0aW9uIGFzc2VydE9jdG9iZXIyOEFkbWlzc2lvblByb29mKHByb29mLG9wdGlvbnMpe3JldHVybiBhc3NlcnRPY3RvYmVyMjhQcm9vZkNvcmUocHJvb2Ysb3B0aW9ucyxPQ1QyOF9QUk9PRl9WRVJTSU9OLFtdKTt9CmV4cG9ydCBmdW5jdGlvbiBhc3NlcnRPY3RvYmVyMjhUZXN0QWRtaXNzaW9uUHJvb2YocHJvb2Yse2xhYmVsLHNvdXJjZUNvbW1pdCx0ZXN0VGFyZ2V0QWRtaXNzaW9ufSl7CiBjb25zdCBzY29wZT1yZXF1aXJlRmluYWxSZXZpZXdUZXN0VGFyZ2V0QWRtaXNzaW9uKHRlc3RUYXJnZXRBZG1pc3Npb24se3NvdXJjZUNvbW1pdH0pLHQ9c2NvcGUudGFyZ2V0OwogYXNzZXJ0T2N0b2JlcjI4UHJvb2ZDb3JlKHByb29mLHtsYWJlbCxzb3VyY2VDb21taXQsbWFqb3I6dC5tYWpvcn0sT0NUMjhfVEVTVF9QUk9PRl9WRVJTSU9OLFRFU1RfUFJPT0ZfS0VZUyk7CiBmb3IoY29uc3Rba2V5LGV4cGVjdGVkXW9mIE9iamVjdC5lbnRyaWVzKHt0YXJnZXRLaW5kOid0ZXN0Jyxwcm9qZWN0SWQ6dC5wcm9qZWN0SWQsYnJhbmNoSWQ6dC5icmFuY2hJZCxlbmRwb2ludElkOnQuZW5kcG9pbnRJZCxkYXRhYmFzZTp0LmRhdGFiYXNlLGRhdGFiYXNlT2lkOnQuZGF0YWJhc2VPaWQsZ3VhcmRPaWQ6dC5ndWFyZE9pZCxzZXJ2ZXJNYWpvcjp0Lm1ham9yLGN1cnJlbnRVc2VyOnQucm9sZSxzZXNzaW9uVXNlcjp0LnJvbGUsdGVzdFRhcmdldE9ic2VydmF0aW9uU2hhMjU2OnNjb3BlLm9ic2VydmF0aW9uU2hhMjU2LHRlc3RUYXJnZXRPYnNlcnZhdGlvblNvdXJjZUNvbW1pdDpzY29wZS5vYnNlcnZhdGlvblNvdXJjZUNvbW1pdH0pKWFzc2VydC5lcXVhbChwcm9vZltrZXldLGV4cGVjdGVkLCdGSU5BTF9SRVZJRVcyMThfVEVTVF9QUk9PRl9JREVOVElUWScpOwogcmV0dXJuIHRydWU7Cn0KZnVuY3Rpb24gYXNzZXJ0T2N0b2JlcjI4UHJvb2ZDb3JlKHByb29mLHtsYWJlbCxzb3VyY2VDb21taXQsbWFqb3J9LHByb29mVmVyc2lvbixleHRyYUtleXMpew=="
      },
      {
        "beforeBase64": "Wy4uLlBST09GX0tFWVMsLi4uKHJlYWRPbmx5P1tdOlsnYmVmb3JlRmluZ2VycHJpbnQnXSld",
        "afterBase64": "Wy4uLlBST09GX0tFWVMsLi4uZXh0cmFLZXlzLC4uLihyZWFkT25seT9bXTpbJ2JlZm9yZUZpbmdlcnByaW50J10pXQ=="
      },
      {
        "beforeBase64": "cHJvb2YudmVyc2lvbixPQ1QyOF9QUk9PRl9WRVJTSU9O",
        "afterBase64": "cHJvb2YudmVyc2lvbixwcm9vZlZlcnNpb24="
      }
    ]
  }
]
;
for(const file of FINAL_REVIEW_TEST_SOURCE_SUCCESSION){for(const operation of file.operations)Object.freeze(operation);Object.freeze(file.operations);Object.freeze(file);}Object.freeze(FINAL_REVIEW_TEST_SOURCE_SUCCESSION);
export function projectFinalReviewTestSourceParent(path,raw){
 assert.ok(Buffer.isBuffer(raw),'FINAL_REVIEW_TEST_SUCCESSION_RAW');
 const file=FINAL_REVIEW_TEST_SOURCE_SUCCESSION.find(item=>item.path===path);if(!file)return raw;
 assert.equal(raw.length,file.afterBytes,'FINAL_REVIEW_TEST_SUCCESSION_SIZE');assert.equal(hash(raw),file.afterSha256,'FINAL_REVIEW_TEST_SUCCESSION_AFTER');
 let text=raw.toString('utf8');assert.ok(Buffer.from(text,'utf8').equals(raw),'FINAL_REVIEW_TEST_SUCCESSION_UTF8');
 for(const operation of [...file.operations].reverse()){
  const after=Buffer.from(operation.afterBase64,'base64').toString('utf8'),before=Buffer.from(operation.beforeBase64,'base64').toString('utf8');
  assert.ok(after.length>0);assert.equal(text.split(after).length,2,'FINAL_REVIEW_TEST_SUCCESSION_SPAN');text=text.replace(after,()=>before);
 }
 const parent=Buffer.from(text,'utf8');assert.equal(parent.length,file.beforeBytes,'FINAL_REVIEW_TEST_SUCCESSION_PARENT_SIZE');assert.equal(hash(parent),file.beforeSha256,'FINAL_REVIEW_TEST_SUCCESSION_PARENT');return parent;
}
