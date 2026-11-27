# Offer email sender: one-time setup

1. Go to https://script.google.com while signed in to your Elders Google account, and click **New project**.
2. Delete the sample code, paste in everything from `Code.gs`, and rename the project **Offer emails**.
3. Choose **sendTestOffer** in the function dropdown at the top, then click **Run**. Approve the permissions when Google asks. A sample offer email arrives in your inbox.
4. Click **Deploy → New deployment**. Click the gear and choose **Web app**, then set:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Click **Deploy** and copy the **Web app URL**, which ends in `/exec`.
5. Send that URL to Claude. It goes into `scriptUrl` in `index.html`.

If you edit the script later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.
