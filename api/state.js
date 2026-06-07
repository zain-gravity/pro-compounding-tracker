import { connectToDatabase } from './db.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('users');

    if (req.method === 'GET') {
      const { username } = req.query;
      if (!username) {
        return res.status(400).json({ error: 'Username query parameter is required' });
      }

      const normalizedUsername = username.trim().toLowerCase();
      const userDoc = await collection.findOne({ username: normalizedUsername });

      if (userDoc) {
        return res.status(200).json({
          username: userDoc.displayName || username,
          plan: userDoc.plan || null,
          actualBalances: userDoc.actualBalances || {},
          prevActualBalance: userDoc.prevActualBalance !== undefined ? userDoc.prevActualBalance : null,
          updatedAt: userDoc.updatedAt || null
        });
      } else {
        // Return default empty state structure if user doesn't exist yet
        return res.status(200).json({
          username: username,
          plan: null,
          actualBalances: {},
          prevActualBalance: null,
          updatedAt: null,
          isNew: true
        });
      }
    } else if (req.method === 'POST') {
      const { username, plan, actualBalances, prevActualBalance } = req.body;
      if (!username) {
        return res.status(400).json({ error: 'Username is required in body' });
      }

      const normalizedUsername = username.trim().toLowerCase();
      const displayName = username.trim(); // preserve original casing for display

      await collection.updateOne(
        { username: normalizedUsername },
        {
          $set: {
            displayName,
            plan,
            actualBalances,
            prevActualBalance,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );

      return res.status(200).json({ success: true, message: 'State saved successfully' });
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
      return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    console.error('[api/state] Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
