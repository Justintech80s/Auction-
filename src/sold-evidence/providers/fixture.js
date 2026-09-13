function cloneRecord(record) {
  return structuredClone(record);
}

export function createFixtureSoldProvider(records = []) {
  const snapshot = (records || []).map(cloneRecord);

  return {
    async searchSoldEvidence() {
      return snapshot.map(cloneRecord);
    }
  };
}
