export async function getDatabaseHealth() {
  try {
    const mongoose = (await import('mongoose')).default;
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    return {
      status: dbState === 1 ? 'healthy' : 'unhealthy',
      state: dbStates[dbState],
      name: mongoose.connection.name || 'N/A',
      host: mongoose.connection.host || 'N/A',
      ready: dbState === 1,
    };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, ready: false };
  }
}

export async function isDatabaseConnected() {
  try {
    // Dynamically import the module so tests can spy/mock the exported helper
    const mod = await import('./health.js');
    const db = await mod.getDatabaseHealth();
    return db.ready === true;
  } catch (error) {
    return false;
  }
}
