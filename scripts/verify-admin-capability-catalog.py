#!/usr/bin/env python3
"""Exercise migration 238 with real IAM functions in a fresh loopback database.

Requires the existing schema-only laboratory fixture and local PostgreSQL binaries.
No application identities, network database URLs or production connection are used.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[1]
SIGNATURE = 'public.tenant_iam_admin_view_v4(text,uuid,integer,text,text,uuid,integer)'
RELEASE = '3d59c5278151de0df4cd08aa73a0c8e833ab5d35'
BEFORE = '4dd56db18e6fa1befb5826a29a0ae135b87ee602c3200fb40c2acc32d0b39c12'
AFTER = 'f49cad7291d18f99b0dca6a2004588fbf56af7c10f8ab7ad73414c6deb3ab176'
ACTOR = 'catalog-owner@qa.invalid'
SESSION = '10000000-0000-4000-8000-000000000001'
TENANT = '20000000-0000-4000-8000-000000000001'


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--pg-share', type=Path)
    parser.add_argument('--baseline-schema', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    temp = Path(tempfile.mkdtemp(prefix='catalog238-', dir=out))
    data = temp / 'data'
    password = secrets.token_urlsafe(32)
    password_file = temp / 'password'
    password_file.write_text(password)
    password_file.chmod(0o600)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    qa_env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    qa_env.update(PGPASSWORD=password, PGCLIENTENCODING='UTF8')
    source = REPO / 'scripts/fixtures/admin-capability-catalog-functions.json'
    installer = REPO / 'scripts/migrations/238-admin-assignable-capability-catalog.sql'
    rollback = REPO / 'scripts/rollback/238-admin-assignable-capability-catalog.sql'
    sources = [Path(__file__), source, installer, rollback, args.baseline_schema]
    receipt = {'version': 'admin-capability-catalog-238-qa.v1', 'status': 'FAIL',
               'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'syntheticOnly': True, 'productionConnections': 0, 'functionMocks': 0,
               'disabledTriggers': 0, 'checks': [], 'clusterStopped': False,
               'sourcePins': {str(path): checksum(path) for path in sources}}
    started = False

    def proc(argv, text=None, timeout=60):
        result = subprocess.run([str(arg) for arg in argv], input=text, text=True,
                                capture_output=True, env=qa_env, timeout=timeout)
        if result.returncode:
            failure = result.stderr + '\n' + result.stdout
            if len(failure) > 7000:
                failure = failure[:3000] + '\n[context truncated]\n' + failure[-4000:]
            raise RuntimeError(failure.replace(password, '[redacted]'))
        return result.stdout.strip()

    def sql(text, database='neondb', role='qa_cluster_admin'):
        return proc([args.pg_bin / 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                     '-h', '127.0.0.1', '-p', port, '-U', role, '-d', database], text)

    def query(text, role='qa_cluster_admin'):
        result = sql(text, role=role)
        return json.loads(result.splitlines()[-1]) if result else None

    def ok(name):
        receipt['checks'].append(name)
        print(name + ': PASS', flush=True)

    def rejects(name, text, expected, role='qa_cluster_admin'):
        try:
            sql(text, role=role)
        except RuntimeError as error:
            assert expected in str(error), {'test': name, 'error': str(error)}
            ok(name)
        else:
            raise AssertionError('EXPECTED_REJECTION_MISSING:' + name)

    def metadata():
        return query("SELECT jsonb_build_object('definition',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'security',p.prosecdef,'volatility',p.provolatile) FROM pg_proc p WHERE p.oid=" + literal(SIGNATURE) + '::regprocedure;')

    def fingerprint():
        tables = ['iam_capability', 'iam_capability_conflict', 'iam_role', 'iam_role_capability',
                  'tenant_membership', 'tenant_membership_capability_override',
                  'internal_users', 'platform_user_role', 'tenant_identity_session']
        return {
            table: sql("SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text,'UTF8')),'hex') FROM public." + table + ' t;') for table in tables}

    def view(resource='bootstrap', tenant=None, actor=ACTOR, session=SESSION, version=1, release=RELEASE):
        params = [literal(actor), literal(session) + '::uuid', str(version), literal(release),
                  literal(resource), 'NULL' if tenant is None else literal(tenant) + '::uuid', '100']
        return query('SELECT public.tenant_iam_admin_view_v4(' + ','.join(params) + ');', 'municontrol_actions_runtime_app')

    try:
        receipt['postgres'] = proc([args.pg_bin / 'postgres', '--version'])
        init = [args.pg_bin / 'initdb', '-D', data, '--username=qa_cluster_admin',
                '--pwfile=' + str(password_file), '--auth-host=scram-sha-256',
                '--auth-local=trust', '--encoding=UTF8', '--locale=C']
        if args.pg_share:
            init += ['-L', args.pg_share]
        proc(init)
        proc([args.pg_bin / 'pg_ctl', '-D', data, '-l', out / 'postgres.log', '-o',
              f"-h127.0.0.1 -p{port} -c unix_socket_directories=''", '-w', 'start'])
        started = True
        sql('CREATE DATABASE neondb;', 'postgres')
        sql(args.baseline_schema.read_text())
        ok('fresh_loopback_schema_only_database')
        # Restore additional canonical empty table definitions used by the real
        # administration chain. No providers or security functions are replaced.
        missing_tables = {
            '004-tenant-iam-control-plane.sql': ['platform_crm_account', 'tenant_exclusive_capability', 'tenant_iam_event'],
            '005-tenant-identity-gateway.sql': ['tenant_identity_mfa_factor'],
            '006-tenant-action-authority.sql': ['tenant_action_area_scope'],
            '013-existing-identity-membership-governance.sql': ['tenant_membership_change_request'],
        }
        for filename, tables in missing_tables.items():
            path = REPO / 'scripts/migrations' / filename
            receipt['sourcePins'][str(path)] = checksum(path)
            content = path.read_text()
            for table in tables:
                pattern = r'(?ms)^CREATE TABLE IF NOT EXISTS ' + re.escape(table) + r' \(.*?^\);'
                definitions = re.findall(pattern, content)
                assert len(definitions) == 1, table
                sql('SET ROLE neondb_owner;\n' + definitions[0])
        view_path = REPO / 'scripts/migrations/098-grh-curated-source-version.sql'
        receipt['sourcePins'][str(view_path)] = checksum(view_path)
        view_definitions = re.findall(
            r'(?ms)^CREATE VIEW public\.grh_source_employees_v1 AS\n.*?;',
            view_path.read_text())
        assert len(view_definitions) == 1
        sql('SET ROLE neondb_owner;\n' + view_definitions[0] +
            '\nREVOKE ALL ON public.grh_source_employees_v1 FROM PUBLIC,municontrol_actions_runtime_app;')
        functions = json.loads(source.read_text())['functions']
        for function in functions:
            signature = 'public.' + function['signature']
            grants = '\nGRANT EXECUTE ON FUNCTION ' + signature + ' TO municontrol_actions_runtime_app;' if 'municontrol_actions_runtime_app=X' in (function['acl'] or '') else ''
            sql('SET check_function_bodies=off; SET ROLE neondb_owner;\n' + function['definition'].rstrip().rstrip(';') + ';\n' +
                '\nALTER FUNCTION ' + signature + ' OWNER TO neondb_owner;\nREVOKE ALL ON FUNCTION ' + signature +
                ' FROM PUBLIC,municontrol_actions_runtime_app;' + grants)
        sql('ALTER ROLE municontrol_actions_runtime_app LOGIN PASSWORD ' + literal(password) + ';')
        ok('real_administration_and_identity_functions_loaded_with_original_acls')
        sql("""SET ROLE neondb_owner;
INSERT INTO public.internal_users(email,display_name,auth_mode,active) VALUES('catalog-owner@qa.invalid','Synthetic catalogue owner','managed',true);
INSERT INTO public.iam_role(role_key,label,description,scope_kind) VALUES('PLATFORM_OWNER','Synthetic owner','Synthetic QA','platform'),('QA_TENANT_MEMBER','Synthetic member','Synthetic QA','tenant');
INSERT INTO public.iam_capability(capability_key,label,description,scope_kind,sensitivity) VALUES
 ('platform.users.manage','Users','Synthetic QA','platform','privileged'),
 ('platform.roles.manage','Roles','Synthetic QA','platform','privileged'),
 ('platform.tenants.manage','Tenants','Synthetic QA','platform','privileged'),
 ('payroll.fixed.read','Read fixed','Synthetic QA','tenant','standard'),
 ('payroll.fixed.approve','Review fixed','Synthetic QA','tenant','privileged'),
 ('payroll.fixed.prepare','Prepare fixed','Synthetic QA','tenant','privileged'),
 ('payroll.calculation.close','Close own payroll','Synthetic QA','tenant','privileged'),
 ('platform.tenant_scoped_fixture','Scope is authoritative','Synthetic QA','tenant','standard'),
 ('payroll.platform_scoped_fixture','Not tenant assignable','Synthetic QA','platform','restricted');
INSERT INTO public.iam_role_capability(role_key,capability_key) SELECT 'PLATFORM_OWNER',capability_key FROM public.iam_capability WHERE scope_kind='platform';
INSERT INTO public.iam_role_capability(role_key,capability_key) VALUES('QA_TENANT_MEMBER','payroll.fixed.read');
INSERT INTO public.iam_capability_conflict(capability_key,conflicts_with_key,reason) VALUES('payroll.fixed.approve','payroll.fixed.prepare','Synthetic independent reviewer');
INSERT INTO public.platform_user_role(user_email,role_key,active,granted_by_user_email) VALUES('catalog-owner@qa.invalid','PLATFORM_OWNER',true,'catalog-owner@qa.invalid');
INSERT INTO public.tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,status,device_label,last_seen_at,expires_at)
VALUES('10000000-0000-4000-8000-000000000001','catalog-owner@qa.invalid',NULL,'platform','mfa',1,1,'active','Synthetic QA only',now(),now()+interval '1 hour');
INSERT INTO public.platform_tenant(id,slug,legal_name,short_name,tenant_kind,jurisdiction,status,created_by_user_email)
VALUES('20000000-0000-4000-8000-000000000001','catalog-qa','Synthetic catalogue tenant','Synthetic QA','sandbox','QA','active','catalog-owner@qa.invalid');
""")
        prior_metadata = metadata()
        assert prior_metadata['definition'] == BEFORE
        baseline = {(resource, tenant): view(resource, tenant) for resource in ['bootstrap', 'roles', 'users'] for tenant in [None, TENANT]}
        assert all('capabilityCatalog' not in result for result in baseline.values())
        assert not any(cap['key'] == 'payroll.calculation.close' for role in baseline['roles', None]['roles'] for cap in role['capabilities'])
        ok('reproduced_missing_close_capability_with_unmodified_real_view')
        before_data = fingerprint()
        sql(installer.read_text())
        assert metadata() == {**prior_metadata, 'definition': AFTER}
        ok('guarded_installation_changes_only_expected_function_body')
        for (resource, tenant), prior in baseline.items():
            result = view(resource, tenant)
            if resource in ['bootstrap', 'roles']:
                catalog = result.pop('capabilityCatalog')
                keys = [cap['key'] for cap in catalog]
                assert keys == sorted(keys) and len(keys) == len(set(keys)) == 5
                assert 'payroll.calculation.close' in keys and 'platform.tenant_scoped_fixture' in keys
                assert 'payroll.platform_scoped_fixture' not in keys and 'platform.roles.manage' not in keys
                assert all(cap['scopeKind'] == 'tenant' for cap in catalog)
                indexed = {cap['key']: cap for cap in catalog}
                assert indexed['payroll.fixed.approve']['conflictsWith'] == ['payroll.fixed.prepare']
                assert indexed['payroll.fixed.prepare']['conflictsWith'] == ['payroll.fixed.approve']
                assert indexed['payroll.calculation.close'] == {
                    'key': 'payroll.calculation.close', 'label': 'Close own payroll',
                    'description': 'Synthetic QA', 'scopeKind': 'tenant',
                    'sensitivity': 'privileged', 'conflictsWith': []}
            assert result == prior, (resource, tenant)
            ok('complete_scoped_catalogue_and_existing_fields_preserved_' + resource + ('_tenant' if tenant else '_global'))
        wrapped = query("SELECT public.tenant_iam_admin_users_sod_baseline_v1(" + literal(ACTOR) + ',' + literal(SESSION) + '::uuid,1,' + literal(RELEASE) + ',' + literal(TENANT) + '::uuid,100);', 'municontrol_actions_runtime_app')
        assert wrapped == baseline['users', TENANT]
        ok('users_sod_wrapper_preserves_original_directory_contract')
        assert fingerprint() == before_data
        ok('catalogue_reads_and_installation_do_not_change_identity_or_grants')
        rejects('runtime_cannot_read_catalogue_table_directly', 'SELECT * FROM public.iam_capability;', 'permission denied', 'municontrol_actions_runtime_app')
        call = "SELECT public.tenant_iam_admin_view_v4(" + literal(ACTOR) + ',' + literal(SESSION) + "::uuid,99," + literal(RELEASE) + ",'bootstrap',NULL,100);"
        rejects('stale_session_still_rejected', call, 'TENANT_IAM_SESSION_INVALID', 'municontrol_actions_runtime_app')
        rejects('release_shape_guard_preserved', call.replace(',99,', ',1,').replace(literal(RELEASE), "'bad'"), 'TENANT_IAM_RELEASE_REQUIRED', 'municontrol_actions_runtime_app')
        rejects('platform_authority_guard_preserved', "BEGIN; DELETE FROM public.iam_role_capability WHERE role_key='PLATFORM_OWNER' AND capability_key='platform.roles.manage'; SET ROLE municontrol_actions_runtime_app; " + call.replace(',99,', ',1,').replace("'bootstrap'", "'roles'") + 'ROLLBACK;', 'TENANT_LIFECYCLE_PLATFORM_CAPABILITY_REQUIRED')
        installed_metadata = metadata()
        sql(installer.read_text())
        assert metadata() == installed_metadata and fingerprint() == before_data
        ok('repeat_installation_is_noop')
        # Concurrent/unreviewed definition and grant changes must stop replacement.
        rejects('installer_rejects_acl_drift', 'BEGIN; GRANT EXECUTE ON FUNCTION ' + SIGNATURE + ' TO PUBLIC;\n' + installer.read_text().replace('BEGIN;', '', 1).rsplit('COMMIT;', 1)[0], 'ADMIN_CATALOG_238_PREIMAGE_CHANGED')
        rejects('installer_rejects_execution_configuration_drift', 'BEGIN; ALTER FUNCTION ' + SIGNATURE + " SET search_path=public;\n" + installer.read_text().replace('BEGIN;', '', 1).rsplit('COMMIT;', 1)[0], 'ADMIN_CATALOG_238_PREIMAGE_CHANGED')
        rejects('installer_rejects_definition_drift', 'BEGIN; ALTER FUNCTION ' + SIGNATURE + " COST 1;\n" + installer.read_text().replace('BEGIN;', '', 1).rsplit('COMMIT;', 1)[0], 'ADMIN_CATALOG_238_PREIMAGE_CHANGED')
        rejects('rollback_rejects_acl_drift', 'BEGIN; GRANT EXECUTE ON FUNCTION ' + SIGNATURE + ' TO PUBLIC;\n' + rollback.read_text().replace('BEGIN;', '', 1).rsplit('COMMIT;', 1)[0], 'ADMIN_CATALOG_238_ROLLBACK_PREIMAGE_CHANGED')
        sql(rollback.read_text())
        assert metadata() == prior_metadata and fingerprint() == before_data
        assert view() == baseline['bootstrap', None]
        ok('rollback_restores_exact_definition_metadata_and_response')
        sql(rollback.read_text())
        assert metadata() == prior_metadata
        ok('repeat_rollback_is_noop')
        for path, digest in receipt['sourcePins'].items():
            assert checksum(Path(path)) == digest, path
        receipt['status'] = 'PASS'
    except Exception as error:
        receipt['error'] = str(error).replace(password, '[redacted]')
        print(receipt['error'], flush=True)
    finally:
        if started:
            try:
                proc([args.pg_bin / 'pg_ctl', '-D', data, '-m', 'fast', '-w', 'stop'])
                receipt['clusterStopped'] = True
            except Exception as error:
                receipt['stopError'] = str(error).replace(password, '[redacted]')
        else:
            receipt['clusterStopped'] = True
        if receipt['clusterStopped']:
            shutil.rmtree(temp)
        receipt['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        receipt['passed'] = len(receipt['checks'])
        receipt['failed'] = 0 if receipt['status'] == 'PASS' else 1
        (out / 'QA_RECEIPT.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps({key: receipt[key] for key in ['status', 'passed', 'failed', 'clusterStopped']}), flush=True)
    if receipt['status'] != 'PASS':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
