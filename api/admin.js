import { connectToDatabase } from './db.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'OPTIONS']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { passcode } = req.query;
    const adminPasscode = process.env.ADMIN_PASSCODE || 'admin123';

    if (!passcode || passcode !== adminPasscode) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Admin Passcode' });
    }

    const { db } = await connectToDatabase();
    const collection = db.collection('users');

    // Fetch all users sorted by last update time
    const users = await collection.find({}).sort({ updatedAt: -1 }).toArray();

    // Clean up internal _id if necessary or send it along
    const sanitizedUsers = users.map(user => ({
      username: user.username,
      displayName: user.displayName || user.username,
      plan: user.plan || null,
      actualBalances: user.actualBalances || {},
      prevActualBalance: user.prevActualBalance !== undefined ? user.prevActualBalance : null,
      updatedAt: user.updatedAt || null
    }));

    return res.status(200).json({ users: sanitizedUsers });
  } catch (error) {
    console.error('[api/admin] Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
