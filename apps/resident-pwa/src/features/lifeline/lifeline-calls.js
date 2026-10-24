import { getAccessToken, requestSupabase } from '@civicneuro/supabase-client';
import { sessionStore } from '../../session.js';

let callKitPromise;
let callKit;
let zegoModule;

export function toZegoUserId(authUserId) {
  if (typeof authUserId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authUserId)) {
    throw new TypeError('A valid signed-in resident ID is required for calls.');
  }
  return authUserId.replaceAll('-', '');
}

export function normalizeLifelinePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function mapResolvedCallMembers(members, resolved) {
  const resolvedByPhone = new Map(
    resolved.map((resident) => [normalizeLifelinePhone(resident.phone), resident])
  );
  return members.map((member) => {
    const resident = resolvedByPhone.get(normalizeLifelinePhone(member.phone));
    return resident ? {
      ...member,
      userId: resident.user_id,
      displayName: resident.display_name
    } : member;
  });
}

export function createLifelineCallRoom() {
  const container = document.createElement('div');
  container.className = 'cn-lifeline-zego-call-room';
  container.setAttribute('aria-label', 'Lifeline call');
  container.hidden = true;
  container.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#111827;';
  return container;
}

async function createCallKit() {
  const accessToken = getAccessToken();
  if (!accessToken) throw new Error('Sign in to start a CivicNeuro call.');

  const response = await fetch('/api/zego-token', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not prepare the call service.');

  zegoModule = await import('@civicneuro/zego-uikit');
  const { ZegoUIKitPrebuilt, ZIM } = zegoModule;
  const authUser = sessionStore.get().user;
  const userID = result.userId;
  const userName = authUser?.fullName || authUser?.user_metadata?.full_name || 'CivicNeuro resident';
  const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
    result.appId,
    result.token,
    null,
    userID,
    userName
  );
  callKit = ZegoUIKitPrebuilt.create(kitToken);
  callKit.addPlugins({ ZIM });
  callKit.setCallInvitationConfig({
    endCallWhenInitiatorLeave: true,
    onSetRoomConfigBeforeJoining: () => {
      const container = document.querySelector('.cn-lifeline-zego-call-room');
      if (!container) throw new Error('The Lifeline call room is not mounted.');
      container.hidden = false;
      return {
        container,
        turnOnCameraWhenJoining: false,
        showMyCameraToggleButton: false,
        showScreenSharingButton: false,
        onLeaveRoom: () => { container.hidden = true; }
      };
    },
    onCallInvitationEnded: () => {
      const container = document.querySelector('.cn-lifeline-zego-call-room');
      if (container) container.hidden = true;
    }
  });
  return callKit;
}

export function initializeLifelineCallKit() {
  if (!callKitPromise) {
    callKitPromise = createCallKit().catch((error) => {
      callKitPromise = null;
      throw error;
    });
  }
  return callKitPromise;
}

export async function resolveLifelineCallMembers(members) {
  const phones = [...new Set(members
    .map((member) => normalizeLifelinePhone(member.phone))
    .filter((phone) => phone.length >= 7 && phone.length <= 15))];
  if (!phones.length) return members;

  const resolved = await requestSupabase('/rest/v1/rpc/resolve_lifeline_circle_members', {
    method: 'POST',
    body: { p_phones: phones }
  });
  return mapResolvedCallMembers(members, resolved);
}

export async function sendLifelineInvitations(members) {
  const mappedMembers = await resolveLifelineCallMembers(members);
  const inAppMembers = mappedMembers.filter((member) => member.userId);
  if (!inAppMembers.length) return { members: mappedMembers, invited: [] };

  const kit = await initializeLifelineCallKit();
  const userIDs = new Set();
  const callees = inAppMembers
    .filter((member) => {
      const userID = toZegoUserId(member.userId);
      if (userIDs.has(userID)) return false;
      userIDs.add(userID);
      return true;
    })
    .map((member) => ({
      userID: toZegoUserId(member.userId),
      userName: member.displayName || member.name
    }));
  if (!callees.length) return { members: mappedMembers, invited: [] };

  const result = await kit.sendCallInvitation({
    callees,
    callType: zegoModule.ZegoUIKitPrebuilt.InvitationTypeVoiceCall,
    timeout: 60,
    data: JSON.stringify({ source: 'lifeline' })
  });
  if (result.errorInvitees?.length) {
    throw new Error('Some in-app Lifeline members could not be invited.');
  }
  return { members: mappedMembers, invited: callees };
}
