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

const PATCHED = Symbol.for('wppconnect-server.waitForInChatPatched');

/**
 * Work around a login race in @wppconnect-team/wppconnect 2.3.x.
 *
 * When a stored session is already registered, `waitForLogin()` takes the
 * "Authenticated" branch without setting `isLogged`. That flag is only set by
 * the background QR loop, which since 2.3 also skips inconclusive checks. If
 * that loop has not run yet, `waitForInChat()` returns false immediately and
 * the session is auto-closed as `phoneNotConnected`, even though it is logged
 * in. (2.2.x hid this because `waitForInChat()` did not await its check.)
 *
 * Before waiting, confirm registration with the same check wppconnect uses
 * for `isAuthenticated()` and record it, so the real device-sync wait runs.
 */
export function applyWppconnectPatches(): void {
  const proto = (Whatsapp as any)?.prototype;
  if (!proto || typeof proto.waitForInChat !== 'function') return;
  if (proto[PATCHED]) return;

  const original = proto.waitForInChat;
  proto.waitForInChat = async function (this: any, ...args: unknown[]) {
    if (!this.isLogged && this.page && !this.page.isClosed()) {
      const registered = await this.page
        .evaluate(() => (window as any).WPP?.conn?.isRegistered?.())
        .catch(() => null);
      if (registered === true) this.isLogged = true;
    }
    return original.apply(this, args);
  };
  proto[PATCHED] = true;
}
