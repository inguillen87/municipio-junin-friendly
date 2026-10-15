// Trusted server policy, not an authority claim or a client configuration.
// The resolver only reads authority; a later decision must revalidate it within
// its own transaction. This policy never labels owner approval as independent.
export const MUNICIPAL_OWNER_ADOPTION_POLICY_CANONICAL='{"actorPersonSource":"existing_verified_municipal_administrative_link","authorityVersion":"municipal-adoption-owner-authority.v1","decisionMode":"owner","independence":false,"inheritedTenantCapabilities":["actions.read"],"operation":"approve_owner","requiredPlatformCapabilities":["platform.tenants.manage"],"requiredPlatformRole":"PLATFORM_OWNER","requiredTenantCapabilities":["workforce.employee.read","employee.record.propose"],"scope":"current_certified_tenant_membership_binding_company","session":{"authLevels":["mfa","recovery"],"identityVersion":"current_database","maxIdleSeconds":3600,"source":"membership"},"version":"tenant-owner-adoption-policy.v1"}';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const MUNICIPAL_OWNER_ADOPTION_POLICY_DESCRIPTION=freeze(JSON.parse(MUNICIPAL_OWNER_ADOPTION_POLICY_CANONICAL));
export const MUNICIPAL_OWNER_ADOPTION_POLICY=Object.freeze({version:'tenant-owner-adoption-policy.v1',sha256:'3cd05ec553d4e19e511b4d755224efe36a470a02502704a621dec608ad312305'});
