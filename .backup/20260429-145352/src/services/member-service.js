'use strict';

const config = require('../config');
const { getPool, withTransaction } = require('../db');
const { randomToken, hashToken } = require('../crypto');
const { badRequest, forbidden, unauthorized } = require('../errors');
const membersRepo = require('../repositories/members');
const notificationsRepo = require('../repositories/notifications');
const tenantsRepo = require('../repositories/tenants');
const usersRepo = require('../repositories/users');
const workspacesRepo = require('../repositories/workspaces');

const INVITABLE_ROLES = new Set(['admin', 'billing_admin', 'developer', 'viewer']);
const ADMIN_ROLES = new Set(['owner', 'admin']);
const BILLING_ROLES = new Set(['owner', 'admin', 'billing_admin']);

function assertTenantOperator(membership) {
  if (!membership || membership.status !== 'active' || (!ADMIN_ROLES.has(membership.role) && !BILLING_ROLES.has(membership.role))) {
    throw forbidden('members_forbidden', 'tenant admin or billing admin role required');
  }
}

function assertInviteManager(membership) {
  if (!membership || membership.status !== 'active' || !ADMIN_ROLES.has(membership.role)) {
    throw forbidden('invite_forbidden', 'tenant owner or admin role required');
  }
}

function mapTenantRoleToWorkspaceRole(role) {
  if (role === 'admin') return 'workspace_admin';
  if (role === 'billing_admin') return 'viewer';
  if (role === 'developer') return 'editor';
  return 'viewer';
}

function inviteExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 7);
  return expiresAt;
}

function sanitizeMember(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    invitedBy: row.invited_by,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sanitizeInvite(row, rawToken) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    inviteToken: rawToken || undefined,
    inviteUrl: rawToken ? `${config.publicBaseUrl}/?invite=${encodeURIComponent(rawToken)}` : undefined
  };
}

async function listMembers({ tenant, membership }) {
  if (!tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  assertTenantOperator(membership);

  const [members, invites] = await Promise.all([
    membersRepo.listTenantMembers(getPool(), tenant.id),
    membersRepo.listTenantInvites(getPool(), tenant.id)
  ]);

  return {
    members: members.map(sanitizeMember),
    invites: invites.map((row) => sanitizeInvite(row))
  };
}

async function inviteMember({ tenant, membership, user, input }) {
  if (!tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  if (!user) {
    throw unauthorized('auth_required', 'authentication required');
  }
  assertInviteManager(membership);

  const email = String(input?.email || '').trim().toLowerCase();
  const role = String(input?.role || '').trim();
  if (!email || !email.includes('@')) {
    throw badRequest('invite_email_required', 'valid invite email is required');
  }
  if (!INVITABLE_ROLES.has(role)) {
    throw badRequest('invite_role_invalid', 'role is not supported for invites');
  }

  const pool = getPool();
  const existingUser = await usersRepo.findUserByEmail(pool, email);
  if (existingUser) {
    const existingMembership = await tenantsRepo.findTenantMembership(pool, tenant.id, existingUser.id);
    if (existingMembership && existingMembership.status !== 'removed') {
      throw badRequest('invite_membership_exists', 'user is already a member of this tenant');
    }
  }

  const existingInvite = await membersRepo.findOpenInviteByEmail(pool, tenant.id, email);
  if (existingInvite) {
    throw badRequest('invite_already_open', 'an active invite already exists for this email');
  }

  const rawToken = randomToken();
  const invite = await withTransaction(async (db) => membersRepo.createTenantInvite(db, {
    tenantId: tenant.id,
    email,
    role,
    inviteTokenHash: hashToken(rawToken),
    invitedBy: user.id,
    expiresAt: inviteExpiryDate()
  }).then(async (createdInvite) => {
    await notificationsRepo.createEmailOutboxEntry(db, {
      kind: 'tenant_invite',
      toEmail: email,
      subject: `You're invited to ${tenant.name} on Eon Chat`,
      template: 'tenant_invite',
      payload: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        role,
        inviteUrl: `${config.publicBaseUrl}/?invite=${encodeURIComponent(rawToken)}`
      }
    });
    return createdInvite;
  }));

  return sanitizeInvite(invite, rawToken);
}

async function acceptInvite({ user, inviteToken }) {
  if (!user) {
    throw unauthorized('auth_required', 'authentication required');
  }
  if (!inviteToken) {
    throw badRequest('invite_token_required', 'invite token is required');
  }

  return withTransaction((db) => acceptInviteForUser({ db, user, inviteToken }));
}

async function acceptInviteForUser({ db, user, inviteToken }) {
  if (!user) {
    throw unauthorized('auth_required', 'authentication required');
  }
  if (!inviteToken) {
    throw badRequest('invite_token_required', 'invite token is required');
  }

  const invite = await membersRepo.findInviteByTokenHash(db, hashToken(inviteToken));
  if (!invite) {
    throw badRequest('invite_invalid', 'invite token is invalid');
  }
  if (invite.accepted_at) {
    throw badRequest('invite_already_accepted', 'invite has already been accepted');
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    throw badRequest('invite_expired', 'invite has expired');
  }
  if (String(invite.email).toLowerCase() !== String(user.email).toLowerCase()) {
    throw forbidden('invite_email_mismatch', 'invite email does not match current user');
  }

  const workspaceRole = mapTenantRoleToWorkspaceRole(invite.role);

  const nextMembership = await membersRepo.upsertTenantMembership(db, {
    tenantId: invite.tenant_id,
    userId: user.id,
    role: invite.role,
    invitedBy: invite.invited_by
  });
  const workspaces = await workspacesRepo.listActiveWorkspacesForTenant(db, invite.tenant_id);
  for (const workspace of workspaces) {
    await membersRepo.upsertWorkspaceMembership(db, {
      workspaceId: workspace.id,
      userId: user.id,
      role: workspaceRole
    });
  }
  await membersRepo.markInviteAccepted(db, invite.id);

  return {
    membership: sanitizeMember({
      ...nextMembership,
      email: user.email,
      name: user.name
    }),
    tenantId: invite.tenant_id
  };
}

module.exports = {
  listMembers,
  inviteMember,
  acceptInvite,
  acceptInviteForUser
};
