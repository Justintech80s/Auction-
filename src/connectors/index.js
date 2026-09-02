import { searchEbay } from './ebay.js';

const connectors = {
  ebay: searchEbay
};

export function listMarketplaceConnectors() {
  return Object.keys(connectors);
}

export async function searchMarketplace(source, query, options = {}) {
  const connector = connectors[source];
  if (!connector) {
    throw new Error(`Unsupported marketplace connector: ${source}`);
  }
  return connector(query, options);
}
