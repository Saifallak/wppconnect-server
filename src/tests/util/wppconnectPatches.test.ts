/*
 * Copyright 2021 WPPConnect Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { Whatsapp } from '@wppconnect-team/wppconnect';

import { applyWppconnectPatches } from '../../util/wppconnectPatches';

const original = (Whatsapp.prototype as any).waitForInChat;

/**
 * A restored session as wppconnect sees it right after the "Authenticated"
 * branch of waitForLogin(): started, registered, but `isLogged` not yet set
 * by the background QR loop.
 */
function restoredSession(registered: unknown, mainReady = true) {
  const host = Object.create(Whatsapp.prototype);
  host.isStarted = true;
  host.isLogged = false;
  host.isInChat = false;
  host.options = { deviceSyncTimeout: 5000 };
  const evaluate = jest
    .fn()
    // 1st call: WPP.conn.isRegistered() from the patch
    .mockImplementationOnce(() =>
      registered instanceof Error
        ? Promise.reject(registered)
        : Promise.resolve(registered)
    )
    // then: WPP.conn.isMainReady() from waitForInChat()
    .mockResolvedValue(mainReady);
  host.page = { isClosed: () => false, evaluate };
  return host;
}

describe('wppconnect waitForInChat patch', () => {
  it('reproduces the upstream race without the patch', async () => {
    const host = restoredSession(true);
    await expect(original.call(host)).resolves.toBe(false);
  });

  describe('with the patch applied', () => {
    beforeAll(() => applyWppconnectPatches());

    it('waits for device sync instead of failing a registered session', async () => {
      const host = restoredSession(true);
      await expect(host.waitForInChat()).resolves.toBe(true);
      expect(host.isLogged).toBe(true);
      expect(host.isInChat).toBe(true);
    });

    it('keeps failing fast when the session is not registered', async () => {
      const host = restoredSession(false);
      await expect(host.waitForInChat()).resolves.toBe(false);
      expect(host.isLogged).toBe(false);
      expect(host.page.evaluate).toHaveBeenCalledTimes(1);
    });

    it('treats an inconclusive registration check as not logged', async () => {
      const host = restoredSession(
        new Error('Execution context was destroyed')
      );
      await expect(host.waitForInChat()).resolves.toBe(false);
      expect(host.isLogged).toBe(false);
    });

    it('is idempotent', () => {
      const patched = (Whatsapp.prototype as any).waitForInChat;
      applyWppconnectPatches();
      expect((Whatsapp.prototype as any).waitForInChat).toBe(patched);
    });
  });
});
