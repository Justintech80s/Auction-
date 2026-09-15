# Auction Shared Backend on Vercel

Auction's shared browser-extension backend is implemented at `api/product-scan.js` and configured by `vercel.json`.

## Deploy

1. In Vercel, import the GitHub repository `Justintech80s/Auction-` as a new project.
2. Use the repository root (`./`) as the Root Directory.
3. Keep the default Node.js project settings. No build output directory is required for the API function.
4. Deploy the project.
5. The production endpoint is:

   `https://<your-project>.vercel.app/api/product-scan`

## Connect the browser extension

1. Open the Auction extension popup.
2. Expand **Shared backend**.
3. Paste the production `/api/product-scan` HTTPS URL.
4. Select **Save Backend**.
5. Reopen the extension so the service worker reloads the stored endpoint.

The endpoint is stored in `chrome.storage.local`. Auction accepts HTTPS endpoints only and rejects URLs containing embedded credentials. Provider API credentials must remain server-side and must never be pasted into the extension.

If no shared backend is configured, Auction keeps its safe local fallback behavior and does not fabricate live cross-store prices.
