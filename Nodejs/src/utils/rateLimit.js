const createRateLimiter = (cooldownMs) => {
  const lastSeen = new Map();
  return (key) => {
    const now = Date.now();
    const last = lastSeen.get(key) || 0;
    if (now - last < cooldownMs) return false;
    lastSeen.set(key, now);
    return true;
  };
};

module.exports = {
  createRateLimiter
};
