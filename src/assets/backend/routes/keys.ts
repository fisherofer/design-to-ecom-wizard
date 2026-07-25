/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

export const keysRouter = Router();

// Key Verification Endpoint
keysRouter.post('/api-vault/verify', async (req: Request, res: Response) => {
  const { apiKey, name, customUrl } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'API Key is required for validation' });
  }

  // Handle local simulation keys for easy testing
  if (apiKey.toUpperCase().includes('SIMULATE') || apiKey.toUpperCase().includes('DEMO')) {
    return res.json({
      success: true,
      simulated: true,
      message: `Verified connection to simulated endpoint: ${name || 'Custom Connection'}. Latency: 18ms.`,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const tester = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-tester',
        },
      },
    });

    const response = await tester.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: 'say key_verified_ok_now',
    });

    res.json({
      success: true,
      message: 'API Key is valid and fully authenticated with Google AI Studio!',
      details: response.text?.trim(),
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[API VERIFY] Failed to verify key:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Verification request failed. Please check the API key format or internet connectivity.'
    });
  }
});
