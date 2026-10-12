/**
 * @file apps/resident-pwa/src/pages/snap-and-say/snap-and-say.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { enqueueReport, generateIdempotencyKey } from '@civicneuro/offline-queue';
import { getAccessToken } from '@civicneuro/supabase-client';
import { validateEvidenceFile } from '../../features/reports/evidence-validation.js';
import { reportCategoryLabel } from '../../features/reports/report-category.js';
import { navigate } from '../../router.js';
import { sessionStore } from '../../session.js';

const MAX_RECORD_SECONDS = 60;
const EMERGENCY_NUMBERS = ['112', '10111', '10177'];

function numberToTime(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export class PageSnapAndSay extends BaseElement {
  constructor() {
    super();
    this._screen = 'permission';
    this._photoFile = null;
    this._photoUrl = null;
    this._audioBlob = null;
    this._audioMime = 'audio/webm';
    this._location = { latitude: null, longitude: null, accuracy: null, status: 'not_requested' };
    this._result = null;
    this._error = '';
    this._recording = false;
    this._recordStartAt = null;
    this._recordSeconds = 0;
    this._mediaRecorder = null;
    this._mediaStream = null;
    this._recordChunks = [];
    this._recordCancelled = false;
    this._fileInput = null;
    this._timerId = null;
    this._recordTimer = null;
    this._recordHint = null;
    this._waveformBars = [];
    this._pointerStart = null;
    this._pointerHeld = false;
    this._audioContext = null;
    this._audioAnalyser = null;
    this._queuedKey = null;
    this._submissionKey = null;
    this._syncedHandler = (event) => {
      if (event.detail?.idempotencyKey !== this._queuedKey) return;
      this._queuedKey = null;
      this._result = event.detail.result;
      this._screen = 'confirmation';
      this.render();
    };
    this._failedHandler = (event) => {
      if (event.detail?.idempotencyKey !== this._queuedKey) return;
      this._queuedKey = null;
      this._result = {
        failure: true,
        error: `The queued report was rejected and was not submitted: ${event.detail.message}`,
        issue_category: 'Not submitted'
      };
      this._screen = 'confirmation';
      this.render();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('offline-report-synced', this._syncedHandler);
    window.addEventListener('offline-report-failed', this._failedHandler);
  }

  disconnectedCallback() {
    this._stopRecordingTimer();
    window.removeEventListener('offline-report-synced', this._syncedHandler);
    window.removeEventListener('offline-report-failed', this._failedHandler);
    this._stopAudioMeter();
    if (this._mediaStream) {
      this._mediaStream.getTracks().forEach((track) => track.stop());
      this._mediaStream = null;
    }
    if (this._photoUrl) {
      URL.revokeObjectURL(this._photoUrl);
      this._photoUrl = null;
    }
    super.disconnectedCallback();
  }

  async _requestPermissions() {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const permissionStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: true
        });
        permissionStream.getTracks().forEach((track) => track.stop());
      }
    } catch {
      this._error = 'Camera and microphone access was not granted. You can still continue by adding a picture and audio later.';
    }

    if ('geolocation' in navigator) {
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            this._location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              status: 'gps'
            };
            resolve();
          },
          () => {
            this._location = { latitude: null, longitude: null, accuracy: null, status: 'no_gps' };
            resolve();
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
      });
    } else {
      this._location.status = 'no_gps';
    }
  }

  _stopRecordingTimer() {
    if (this._timerId) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
  }

  _stopAudioMeter() {
    if (this._audioContext && this._audioContext.state !== 'closed') {
      this._audioContext.close();
    }
    this._audioContext = null;
    this._audioAnalyser = null;
  }

  _updateRecordingDisplay() {
    const elapsed = (Date.now() - this._recordStartAt) / 1000;
    this._recordSeconds = elapsed;
    if (this._recordTimer) this._recordTimer.textContent = numberToTime(elapsed);
    if (this._audioAnalyser) {
      const samples = new Uint8Array(this._audioAnalyser.fftSize);
      this._audioAnalyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += Math.abs(sample - 128);
      const level = Math.min(1, energy / samples.length / 32);
      this._waveformBars.forEach((bar, index) => {
        const modulation = Math.abs(Math.sin((Date.now() / 180) + index * 0.8));
        bar.style.height = `${8 + (level * modulation * 38)}px`;
      });
    }
    if (elapsed >= MAX_RECORD_SECONDS) this._stopRecording(true);
  }

  async _startRecording() {
    if (this._recording) return;
    this._recordCancelled = false;
    this._error = '';
    this._recordChunks = [];
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._error = 'This device does not support microphone recording in the browser.';
      if (this._recordHint) this._recordHint.textContent = this._error;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._mediaStream = stream;
      const supportedTypes = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
      const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      this._mediaRecorder = recorder;
      this._audioMime = recorder.mimeType || mimeType || 'audio/webm';
      this._recordStartAt = Date.now();
      this._recordSeconds = 0;
      this._recording = true;
      if (navigator.vibrate) navigator.vibrate(20);
      const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
      if (AudioContextImpl) {
        this._audioContext = new AudioContextImpl();
        this._audioAnalyser = this._audioContext.createAnalyser();
        this._audioAnalyser.fftSize = 256;
        this._audioContext.createMediaStreamSource(stream).connect(this._audioAnalyser);
      }
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) this._recordChunks.push(event.data);
      };
      recorder.onstop = () => {
        const elapsedSeconds = (Date.now() - this._recordStartAt) / 1000;
        this._recordSeconds = elapsedSeconds;
        const audioBlob = new Blob(this._recordChunks, { type: recorder.mimeType || mimeType || '' });
        this._audioBlob = audioBlob;
        this._stopAudioMeter();
        if (this._recordCancelled) {
          this._audioBlob = null;
          this._recording = false;
          return;
        }
        if (elapsedSeconds < 1) {
          this._error = 'Hold the button and speak';
          this._audioBlob = null;
          this._recording = false;
          const button = this.querySelector('[data-record-button]');
          if (button) button.textContent = 'Hold to record';
          if (this._recordHint) this._recordHint.textContent = this._error;
          if (this._recordTimer) this._recordTimer.textContent = numberToTime(elapsedSeconds);
          return;
        }
        this._audioMime = audioBlob.type || recorder.mimeType || mimeType || 'audio/webm';
        this._screen = 'sending';
        this.render();
        this._submitReport();
      };
      recorder.start();
      this._recordTimer = this.querySelector('[data-record-timer]');
      this._recordHint = this.querySelector('[data-record-hint]');
      const button = this.querySelector('[data-record-button]');
      if (button) button.textContent = 'Recording…';
      if (this._recordHint) this._recordHint.textContent = 'Keep holding to speak. Slide away to cancel.';
      this._stopRecordingTimer();
      this._timerId = setInterval(() => this._updateRecordingDisplay(), 100);
      if (!this._pointerHeld) this._stopRecording(false);
    } catch (error) {
      this._recording = false;
      this._error = error.message || 'Microphone access or recording failed.';
      if (this._recordHint) this._recordHint.textContent = this._error;
      if (this._mediaStream) this._mediaStream.getTracks().forEach((track) => track.stop());
      this._mediaStream = null;
      this._stopAudioMeter();
    }
  }

  _stopRecording(autoSubmit = false) {
    if (!this._mediaRecorder || this._mediaRecorder.state === 'inactive') {
      if (autoSubmit && this._recordChunks.length > 0) {
        this._screen = 'sending';
        this._submitReport();
      }
      return;
    }
    this._stopRecordingTimer();
    this._recording = false;
    this._mediaRecorder.stop();
    if (this._mediaStream) {
      this._mediaStream.getTracks().forEach((track) => track.stop());
      this._mediaStream = null;
    }
    if (!autoSubmit && this._recordHint) this._recordHint.textContent = 'Recording stopped.';
  }

  _cancelRecording() {
    this._recordCancelled = true;
    this._stopRecording(false);
    this._error = 'Recording cancelled';
    this.render();
  }

  async _submitReportLegacy() {
    if (!this._audioBlob) {
      this._screen = 'camera';
      this.render();
      return;
    }

    try {
      const formData = new FormData();
      const extension = this._audioMime.includes('mp4') ? 'mp4' : this._audioMime.includes('ogg') ? 'ogg' : 'webm';
      formData.append('audio', this._audioBlob, `snap-${Date.now()}.${extension}`);
      if (this._photoFile) {
        const photoName = this._photoFile.name || `photo-${Date.now()}.jpg`;
        formData.append('image', this._photoFile, photoName);
      }
      formData.append('latitude', String(this._location.latitude ?? ''));
      formData.append('longitude', String(this._location.longitude ?? ''));
      formData.append('location_accuracy', String(this._location.accuracy ?? 0));
      formData.append('device_timestamp', new Date().toISOString());
      if (!this._submissionKey) this._submissionKey = generateIdempotencyKey();
      formData.append('idempotency_key', this._submissionKey);
      const session = sessionStore.get();
      const runtimeConfig = (await import('../../../runtime-config.js')).default;
      const response = await fetch(`${runtimeConfig.supabaseUrl}/functions/v1/snap-and-say`, {
        method: 'POST',
        headers: {
          Authorization: session?.accessToken ? `Bearer ${session.accessToken}` : ''
        },
        body: formData
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (body && body.code === 'AUDIO_TOO_SHORT') {
          this._error = 'Hold the button and speak';
          this._screen = 'recording';
          this.render();
          return;
        }
        throw new Error(body.message || 'The report could not be sent.');
      }

      const body = await response.json();
      this._result = body.report || body;
      this._screen = 'confirmation';
      this.render();
    } catch (error) {
      this._error = error.message || 'The report could not be sent. It has been queued for retry.';
      const queuedPayload = {
        type: 'snap-and-say',
        queuedAt: new Date().toISOString(),
        photoName: this._photoFile?.name || null,
        location: this._location,
        audioMime: this._audioMime,
        urgency: this._result?.urgency || 'MEDIUM'
      };
      await enqueueReport(queuedPayload).catch(() => {});
      this._screen = 'confirmation';
      this._result = {
        urgency: 'MEDIUM',
        issue_category: 'Queued for retry',
        english_translation: 'Your report was saved offline and will retry automatically once the connection improves.',
        recommended_organization: { organization_name: 'Municipal dispatch desk', jurisdiction_level: 'municipal', reasoning: 'Queued locally while offline.' },
        emergency_numbers: EMERGENCY_NUMBERS,
        queued: true
      };
      this.render();
    }
  }

  async _captureSubmissionLocation() {
    if (!navigator.geolocation) {
      this._location = { latitude: null, longitude: null, accuracy: null, status: 'no_gps' };
      return;
    }
    await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          this._location = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            status: 'gps'
          };
          resolve();
        },
        () => {
          this._location = { latitude: null, longitude: null, accuracy: null, status: 'no_gps' };
          resolve();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  async _postReport(payload) {
    const formData = new FormData();
    const audioType = payload.audioBlob.type || payload.audioMime || this._audioMime || 'audio/webm';
    const baseMime = audioType.split(';', 1)[0].toLowerCase();
    const extension = baseMime.includes('mp4') ? 'mp4' : baseMime.includes('ogg') ? 'ogg' : baseMime.includes('aac') ? 'aac' : baseMime.includes('mpeg') ? 'mp3' : baseMime.includes('wav') ? 'wav' : 'webm';
    formData.append('audio', payload.audioBlob, `snap-${Date.now()}.${extension}`);
    if (payload.imageBlob) formData.append('image', payload.imageBlob, `evidence-${Date.now()}`);
    formData.append('duration_seconds', String(payload.durationSeconds));
    formData.append('latitude', String(payload.location.latitude ?? ''));
    formData.append('longitude', String(payload.location.longitude ?? ''));
    formData.append('location_accuracy', String(payload.location.accuracy ?? ''));
    formData.append('device_timestamp', payload.deviceTimestamp);
    formData.append('idempotency_key', payload.idempotency_key);

    const runtimeConfig = (await import('../../../runtime-config.js')).default;
    const token = getAccessToken();
    let response;
    try {
      response = await fetch(`${runtimeConfig.supabaseUrl}/functions/v1/snap-and-say`, {
        method: 'POST',
        headers: {
          apikey: runtimeConfig.supabaseAnonKey,
          Authorization: token ? `Bearer ${token}` : `Bearer ${runtimeConfig.supabaseAnonKey}`
        },
        body: formData
      });
    } catch (error) {
      error.networkFailure = true;
      throw error;
    }
    let body = {};
    try {
      body = await response.json();
    } catch (error) {
      if (response.ok) {
        error.status = response.status;
        throw error;
      }
    }
    if (!response.ok) {
      const failure = new Error(body.message || `The report was rejected (${response.status}).`);
      failure.status = response.status;
      failure.code = body.code;
      throw failure;
    }
    return body.report || body;
  }

  async _submitReport() {
    if (!this._audioBlob) return;
    this._screen = 'sending';
    this.render();
    await this._captureSubmissionLocation();
    if (!this._submissionKey) this._submissionKey = generateIdempotencyKey();
    const payload = {
      type: 'snap-and-say',
      idempotency_key: this._submissionKey,
      audioBlob: this._audioBlob,
      imageBlob: this._photoFile,
      audioMime: this._audioMime,
      durationSeconds: this._recordSeconds,
      location: this._location,
      deviceTimestamp: new Date().toISOString()
    };
    try {
      if (!navigator.onLine) {
        await this._queueSubmission(payload);
        return;
      }
      this._result = await this._postReport(payload);
      this._screen = 'confirmation';
      this.render();
    } catch (error) {
      if (error.status === 422 && error.code === 'AUDIO_TOO_SHORT') {
        this._error = 'Hold the button and speak for at least one second.';
        this._screen = 'recording';
        this.render();
        return;
      }
      if (error.status >= 400 && error.status < 500) {
        this._result = { failure: true, error: error.message, issue_category: 'Not submitted' };
        this._screen = 'confirmation';
        this.render();
        return;
      }
      if (error.status >= 500 || error.networkFailure) {
        await this._queueSubmission(payload, error);
        return;
      }
      this._result = { failure: true, error: error.message || 'The report could not be submitted.', issue_category: 'Not submitted' };
      this._screen = 'confirmation';
      this.render();
    }
  }

  async _queueSubmission(payload, cause) {
    try {
      const queuedItem = await enqueueReport(payload);
      this._queuedKey = queuedItem.idempotencyKey;
    } catch (error) {
      this._result = {
        failure: true,
        error: `The network failed and this device could not save the report for retry: ${error.message}`,
        issue_category: 'Not saved'
      };
      this._screen = 'confirmation';
      this.render();
      return;
    }
    this._result = {
      queued: true,
      issue_category: 'Queued for retry',
      urgency: 'Pending analysis',
      english_translation: 'Your audio and photo are saved on this device. The report has not reached the service yet and will retry automatically when the connection returns.',
      queue_reason: cause?.message || 'No network connection.'
    };
    this._screen = 'confirmation';
    this.render();
  }

  render() {
    clearChildren(this);
    const shell = createElement('div', { cls: 'snap-shell' });
    shell.style.cssText = 'max-width:430px;margin:0 auto;padding:18px 16px 40px;font-family:system-ui,sans-serif;color:#17222d;background:#f3efe8;min-height:100vh;';

    if (this._screen === 'permission') {
      shell.appendChild(this._renderPermission());
    } else if (this._screen === 'camera') {
      shell.appendChild(this._renderCamera());
    } else if (this._screen === 'recording') {
      shell.appendChild(this._renderRecording());
    } else if (this._screen === 'sending') {
      shell.appendChild(this._renderSending());
    } else if (this._screen === 'confirmation') {
      shell.appendChild(this._renderConfirmation());
    }

    this.appendChild(shell);
  }

  _renderPermission() {
    const card = createElement('div');
    card.style.cssText = 'background:#fff;border-radius:20px;padding:24px 18px;box-shadow:0 12px 30px rgba(0,0,0,0.08);';

    const badge = createElement('div', { text: 'Snap & Say' });
    badge.style.cssText = 'display:inline-flex;padding:6px 10px;border-radius:999px;background:#e6f4ec;color:#0f5c44;font-weight:700;font-size:12px;margin-bottom:18px;';

    if (!getAccessToken()) {
      const title = createElement('h2', { text: 'Sign in to send a Snap & Say report' });
      title.style.cssText = 'margin:0 0 12px;font-size:28px;line-height:1.2;';
      const copy = createElement('p', { text: 'Snap & Say reports are attached to your resident account so the receiving organisation can follow up. Sign in or create an account before recording.' });
      copy.style.cssText = 'margin:0 0 20px;line-height:1.6;color:#455763;';
      const signIn = createElement('button', { text: 'Sign in' });
      signIn.type = 'button';
      signIn.style.cssText = 'width:100%;padding:16px;border:none;border-radius:12px;background:#0f6e56;color:#fff;font-weight:700;';
      signIn.onclick = () => navigate('sign-in');
      const register = createElement('button', { text: 'Create account' });
      register.type = 'button';
      register.style.cssText = 'width:100%;margin-top:10px;padding:16px;border:2px solid #0f6e56;border-radius:12px;background:#fff;color:#0f6e56;font-weight:700;';
      register.onclick = () => navigate('register');
      card.append(badge, title, copy, signIn, register);
      return card;
    }

    const title = createElement('h2', { text: 'Allow camera, mic and location access?' });
    title.style.cssText = 'margin:0 0 12px;font-size:28px;line-height:1.2;';

    const copy = createElement('p', { text: 'We need your camera to capture evidence, your microphone to record your report, and your location to route it to the right authority. If GPS is denied, we will still submit the report and flag it as no GPS.' });
    copy.style.cssText = 'margin:0 0 20px;line-height:1.6;color:#455763;';

    const actions = createElement('div');
    actions.style.cssText = 'display:flex;gap:12px;';

    const cancel = createElement('button', { text: 'Not now' });
    cancel.type = 'button';
    cancel.style.cssText = 'flex:1;padding:14px 12px;border:none;border-radius:12px;background:#edf2f5;color:#1c2b38;font-weight:700;';
    cancel.onclick = () => navigate('home');

    const allow = createElement('button', { text: 'Allow access' });
    allow.type = 'button';
    allow.style.cssText = 'flex:1;padding:14px 12px;border:none;border-radius:12px;background:#0f6e56;color:#fff;font-weight:700;';
    allow.onclick = async () => {
      await this._requestPermissions();
      this._screen = 'camera';
      this.render();
    };

    actions.append(cancel, allow);
    card.append(badge, title, copy, actions);
    return card;
  }

  _renderCamera() {
    const wrap = createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:16px;';

    const top = createElement('div');
    top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
    const back = createElement('button', { text: '� Back' });
    back.type = 'button';
    back.style.cssText = 'background:transparent;border:none;color:#1b2f39;font-size:16px;font-weight:700;padding:8px 0;';
    back.onclick = () => navigate('home');
    const title = createElement('h2', { text: 'Snap evidence' });
    title.style.cssText = 'margin:0;font-size:24px;';
    top.append(back, title);

    const previewWrap = createElement('div');
    previewWrap.style.cssText = 'background:#e9ecee;border-radius:20px;min-height:320px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;';

    if (this._photoUrl) {
      const image = createElement('img');
      image.src = this._photoUrl;
      image.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      previewWrap.appendChild(image);
    } else {
      const prompt = createElement('div', { text: 'Take a photo of the issue.' });
      prompt.style.cssText = 'text-align:center;color:#556670;font-weight:600;';
      previewWrap.appendChild(prompt);
    }

    const chooseButton = createElement('button', { text: this._photoFile ? 'Retake photo' : 'Take photo' });
    chooseButton.type = 'button';
    chooseButton.style.cssText = 'padding:16px 18px;border:none;border-radius:14px;background:#1a5d86;color:#fff;font-weight:700;';
    chooseButton.onclick = () => {
      if (!this._fileInput) {
        const input = createElement('input', { attrs: { type: 'file', accept: 'image/heic,image/heif,image/jpeg,image/jpg,image/png,image/webp', capture: 'environment' } });
        input.style.display = 'none';
        input.onchange = (event) => {
          const [file] = event.target.files || [];
          if (!file) return;
          const validationMessage = validateEvidenceFile(file, 'photo');
          if (validationMessage) {
            event.target.value = '';
            this._error = validationMessage;
            this.render();
            return;
          }
          if (this._photoUrl) URL.revokeObjectURL(this._photoUrl);
          this._photoFile = file;
          this._photoUrl = URL.createObjectURL(file);
          this._error = '';
          this.render();
        };
        this._fileInput = input;
      }
      if (!this._fileInput.isConnected) this.appendChild(this._fileInput);
      this._fileInput.click();
    };

    const continueButton = createElement('button', { text: 'Continue to record' });
    continueButton.type = 'button';
    continueButton.style.cssText = 'padding:16px;border:none;border-radius:14px;background:#0f6e56;color:#fff;font-weight:700;';
    continueButton.onclick = () => {
      this._screen = 'recording';
      this.render();
    };
    const skipButton = createElement('button', { text: 'Skip photo' });
    skipButton.type = 'button';
    skipButton.style.cssText = 'padding:14px;border:2px solid #0f6e56;border-radius:14px;background:#fff;color:#0f6e56;font-weight:700;';
    skipButton.onclick = () => {
      this._photoFile = null;
      if (this._photoUrl) URL.revokeObjectURL(this._photoUrl);
      this._photoUrl = null;
      this._screen = 'recording';
      this.render();
    };

    const note = createElement('p', { text: this._error || 'Take a photo, then press and hold the mic to record your report.' });
    note.style.cssText = 'margin:0;color:#4b5d6a;line-height:1.5;';

    wrap.append(top, previewWrap, chooseButton, continueButton, skipButton, note);
    return wrap;
  }

  _renderRecording() {
    const wrap = createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:18px;';

    const header = createElement('div', { text: 'Record your incident' });
    header.style.cssText = 'font-size:22px;font-weight:800;color:#1b2f39;';

    const timer = createElement('div', { text: numberToTime(this._recordSeconds), attrs: { 'data-record-timer': '' } });
    timer.style.cssText = 'font-size:34px;font-weight:900;text-align:center;color:#0f6e56;';

    const meter = createElement('div');
    meter.style.cssText = 'height:92px;border-radius:32px;background:linear-gradient(180deg,#d9efe6,#ecefe6);display:flex;align-items:center;justify-content:center;';

    const button = createElement('button');
    button.type = 'button';
    button.setAttribute('data-record-button', '');
    button.style.touchAction = 'none';
    button.textContent = this._recording ? 'Recording�' : 'Hold to record';
    button.style.cssText = 'width:150px;height:150px;border-radius:50%;border:none;background:linear-gradient(180deg,#0f6e56,#0a3a2d);color:#fff;font-size:18px;font-weight:800;box-shadow:0 18px 30px rgba(20,106,86,0.35);';

    const waveform = createElement('div');
    waveform.style.cssText = 'display:flex;align-items:flex-end;justify-content:center;gap:6px;height:48px;margin-top:14px;';
    this._waveformBars = [];
    for (let i = 0; i < 12; i += 1) {
      const bar = createElement('span');
      const height = 10 + (((i + 1) * 7) % 32);
      bar.style.cssText = `display:block;width:8px;height:${height}px;border-radius:999px;background:#0f6e56;opacity:${0.35 + (i / 12)};`;
      waveform.appendChild(bar);
      this._waveformBars.push(bar);
    }

    button.onpointerdown = async (event) => {
      if (this._recording) return;
      event.preventDefault();
      if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
      this._pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      this._pointerHeld = true;
      await this._startRecording();
    };
    button.onpointermove = (event) => {
      if (!this._pointerStart || event.pointerId !== this._pointerStart.pointerId || !this._recording) return;
      if (Math.hypot(event.clientX - this._pointerStart.x, event.clientY - this._pointerStart.y) > 80) {
        this._cancelRecording();
      }
    };
    button.onpointerup = (event) => {
      if (this._pointerStart?.pointerId !== event.pointerId) return;
      this._pointerStart = null;
      this._pointerHeld = false;
      if (this._recording) {
        this._stopRecording(false);
      }
    };
    button.onpointercancel = () => {
      if (this._recording) this._cancelRecording();
      this._pointerStart = null;
      this._pointerHeld = false;
    };

    const hint = createElement('p', { text: this._error || 'Press and hold the button and speak. Slide away to cancel.', attrs: { 'data-record-hint': '' } });
    hint.style.cssText = 'margin:0;text-align:center;color:#455763;line-height:1.5;';

    meter.appendChild(button);
    wrap.append(header, timer, meter, waveform, hint);
    this._recordTimer = timer;
    this._recordHint = hint;
    return wrap;
  }

  _renderSending() {
    const card = createElement('div');
    card.style.cssText = 'background:#fff;border-radius:20px;padding:28px 20px;text-align:center;';
    const title = createElement('h2', { text: 'Sending your report�' });
    title.style.cssText = 'margin:0 0 12px;font-size:28px;';
    const text = createElement('p', { text: 'We are checking the photo and audio, then routing it to the right organisation.' });
    text.style.cssText = 'margin:0;color:#465663;line-height:1.6;';
    const bar = createElement('div');
    bar.style.cssText = 'margin-top:20px;height:12px;border-radius:999px;background:#e8eef2;overflow:hidden;';
    const inner = createElement('div');
    inner.style.cssText = 'height:100%;width:70%;background:linear-gradient(90deg,#0f6e56,#3c9b7d);border-radius:inherit;';
    bar.appendChild(inner);
    card.append(title, text, bar);
    return card;
  }

  _renderConfirmation() {
    const card = createElement('div');
    card.style.cssText = 'background:#fff;border-radius:20px;padding:22px 18px;box-shadow:0 12px 30px rgba(0,0,0,0.08);';

    const outcome = this._result?.failure ? 'Not submitted' : this._result?.queued ? 'Queued offline' : 'Report received';
    const badge = createElement('div', { text: outcome });
    badge.style.cssText = 'display:inline-flex;padding:6px 10px;border-radius:999px;background:#e6f4ec;color:#0f5c44;font-weight:700;font-size:12px;';

    const title = createElement('h2', {
      text: this._result?.failure ? 'Your report was not submitted' : this._result?.queued ? 'Saved for retry' : 'Your report was received'
    });
    title.style.cssText = 'margin:16px 0 10px;font-size:28px;';

    if (this._result?.english_translation) {
      const bubble = createElement('div');
      bubble.style.cssText = 'background:#f4f8fb;border-radius:14px;padding:16px;margin-bottom:16px;';
      const label = createElement('div', { text: 'What you said' });
      label.style.cssText = 'font-size:11px;color:#5b6f7d;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;';
      const text = createElement('div', { text: this._result.english_translation });
      text.style.cssText = 'margin-top:8px;line-height:1.5;color:#17222d;';
      bubble.append(label, text);
      card.appendChild(bubble);
    }

    const facts = createElement('div');
    facts.style.cssText = 'display:grid;gap:12px;';
    if (this._result?.tracking_number) {
      const tracking = createElement('div');
      tracking.style.cssText = 'margin-bottom:14px;padding:12px;border:1px solid #d7e3dd;border-radius:12px;background:#f6faf8;';
      tracking.append(
        createElement('div', { text: 'Tracking number' }),
        createElement('strong', { text: this._result.tracking_number })
      );
      card.appendChild(tracking);
    }
    if (sessionStore.get()?.isGuest && this._result?.lookup_code) {
      const lookup = createElement('div');
      lookup.style.cssText = 'margin-bottom:14px;padding:12px;border:1px solid #d7e3dd;border-radius:12px;background:#f6faf8;';
      lookup.append(
        createElement('div', { text: 'Guest lookup code — save this with your tracking number' }),
        createElement('strong', { text: this._result.lookup_code })
      );
      card.appendChild(lookup);
    }
    const items = [
      ['Type', reportCategoryLabel({
        status: this._result?.status,
        ai_category: this._result?.issue_category
      })],
      ['Urgency', this._result?.urgency || 'MEDIUM']
    ];
    for (const [label, value] of items) {
      const row = createElement('div');
      row.style.cssText = 'padding:12px 14px;border:1px solid #e8edf1;border-radius:12px;background:#fbfcfd;';
      const labelEl = createElement('div', { text: label });
      labelEl.style.cssText = 'font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#5b6f7d;font-weight:700;';
      const valueEl = createElement('div', { text: value });
      valueEl.style.cssText = 'margin-top:6px;font-weight:700;color:#17222d;';
      row.append(labelEl, valueEl);
      facts.appendChild(row);
    }
    card.append(badge, title, facts);
    if (this._result?.failure && this._result.error) {
      const errorText = createElement('p', { text: this._result.error });
      errorText.style.cssText = 'margin:16px 0 0;padding:12px;background:#fff0f0;border-radius:10px;color:#7b1d1d;line-height:1.5;';
      card.appendChild(errorText);
    }

    if (this._result?.emergency_numbers?.length) {
      const emergency = createElement('div');
      emergency.style.cssText = 'margin-top:16px;background:#fff0f0;border:1px solid #f0c2c2;border-radius:12px;padding:14px;';
      const heading = createElement('div', { text: 'Emergency numbers' });
      heading.style.cssText = 'font-weight:800;color:#7b1d1d;';
      const list = createElement('div');
      list.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;';
      for (const number of this._result.emergency_numbers) {
        const button = createElement('a', { text: `${number}` });
        button.href = `tel:${number}`;
        button.style.cssText = 'display:inline-flex;padding:10px 12px;border-radius:999px;background:#fff;color:#7b1d1d;font-weight:700;text-decoration:none;border:1px solid #f0c2c2;';
        list.appendChild(button);
      }
      emergency.append(heading, list);
      card.appendChild(emergency);
    }

    const edit = createElement('button', { text: 'Something wrong? Edit' });
    edit.type = 'button';
    edit.style.cssText = 'width:100%;margin-top:18px;padding:16px;border:none;border-radius:12px;background:#edf2f5;color:#1c2b38;font-weight:700;';
    edit.onclick = () => {
      this._screen = 'camera';
      this._result = null;
      this.render();
    };

    const done = createElement('button', { text: 'Done' });
    done.type = 'button';
    done.style.cssText = 'width:100%;margin-top:10px;padding:16px;border:none;border-radius:12px;background:#0f6e56;color:#fff;font-weight:700;';
    done.onclick = () => navigate('home');

    card.append(edit, done);
    return card;
  }
}

customElements.define('page-snap-and-say', PageSnapAndSay);
