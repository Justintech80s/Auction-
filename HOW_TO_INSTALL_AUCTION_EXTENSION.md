# Install Auction Browser Extension

The ready-to-use developer package is [`Auction-Browser-Extension-v1.0.0.zip`](Auction-Browser-Extension-v1.0.0.zip) in the root of this repository.

The v1.0.0 ZIP is packaged for easy installation: after **Extract All**, the extracted folder itself contains `manifest.json`. There is no extra `auction-extension` folder to click through.

## Google Chrome

1. Download `Auction-Browser-Extension-v1.0.0.zip`.
2. Right-click the ZIP and choose **Extract All**.
3. Open Chrome and go to `chrome://extensions/`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted `Auction-Browser-Extension-v1.0.0` folder — the folder where `manifest.json` is directly visible.
7. Do **not** select the ZIP itself and do **not** open the `content` folder.
8. Pin Auction from Chrome's Extensions menu if you want the **A** available in the toolbar.
9. Visit a product page or another webpage showing a product, click the Auction **A**, and choose **Scan This Product**.
10. Auction opens its side panel and shows the scan/search state and available results.

## Microsoft Edge

1. Download and extract `Auction-Browser-Extension-v1.0.0.zip`.
2. Open Edge and go to `edge://extensions/`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted folder that directly contains `manifest.json`.
6. Pin Auction if desired, visit a page containing a product, click the Auction **A**, then choose **Scan This Product**.

## What Scan This Product Does

A scan starts only after you click the Auction toolbar button and choose **Scan This Product**. Auction uses temporary `activeTab` access to collect bounded product-relevant information from that one page, such as structured product metadata, title/model/spec information, and a primary image reference when available.

Auction can then identify the product and process cross-store offers through its provider-neutral search layer. Results are kept separate as **New**, **Refurbished**, **Used**, and unknown condition. Auction can show item price, known shipping, confirmed delivered total, exact/similar match state, Guardian review state, and a direct merchant **Buy** link.

Auction does not continuously inspect arbitrary webpages and does not request `<all_urls>`.

## Updating Auction Later

Download the newer ZIP, extract it to a new folder, remove or replace the old unpacked folder, then return to your browser extensions page and click **Reload** on Auction or load the new folder.

## Important Live-Data Note

The extension package contains no provider credentials. The scan, matching, ranking, safety, popup, and side-panel architecture are included in the extension, but live credentialed visual recognition and live cross-store shopping data require an approved secure backend/provider connection. If that backend is not configured, Auction deliberately returns a safe **Needs confirmation** or **Provider unavailable** state rather than inventing live prices.

Final price, taxes, shipping, stock, seller terms, warranties, and checkout are controlled by the merchant. Auction does not automate purchasing or checkout.
