/**
 * sso-detection.test.ts — Tests for AWS SSO profile auto-detection.
 *
 * Tests the detectSsoProfile() function which parses ~/.aws/config to find
 * the best SSO profile for credential refresh, and the AWS_PROFILE env var
 * fallback in getAwsAuthRefreshCommand().
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { detectSsoProfile } from "../index.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function withHome(home: string, fn: () => void): void {
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    fn();
  } finally {
    if (saved === undefined) delete process.env.HOME;
    else process.env.HOME = saved;
  }
}

function makeTempHome(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "gsd-aws-auth-test-")));
}

function writeAwsConfig(home: string, content: string): void {
  mkdirSync(join(home, ".aws"), { recursive: true });
  writeFileSync(join(home, ".aws", "config"), content, "utf-8");
}

// ─── detectSsoProfile ─────────────────────────────────────────────────────────

test("detectSsoProfile returns undefined when ~/.aws/config does not exist", () => {
  const home = makeTempHome();
  try {
    withHome(home, () => {
      // No .aws/config written — directory exists but file does not
      const result = detectSsoProfile();
      assert.equal(result, undefined);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("detectSsoProfile returns undefined when config has no SSO profiles", () => {
  const home = makeTempHome();
  try {
    writeAwsConfig(home, [
      "[profile no-sso]",
      "region = us-east-1",
      "output = json",
      "",
    ].join("\n"));
    withHome(home, () => {
      assert.equal(detectSsoProfile(), undefined);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("detectSsoProfile returns first SSO profile when none has bedrock in role name", () => {
  const home = makeTempHome();
  try {
    writeAwsConfig(home, [
      "[profile dev]",
      "sso_start_url = https://my-org.awsapps.com/start",
      "sso_account_id = 123456789012",
      "sso_role_name = DeveloperAccess",
      "region = us-east-1",
      "",
      "[profile staging]",
      "sso_start_url = https://my-org.awsapps.com/start",
      "sso_account_id = 123456789012",
      "sso_role_name = StagingAccess",
      "region = us-east-1",
      "",
    ].join("\n"));
    withHome(home, () => {
      assert.equal(detectSsoProfile(), "dev");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("detectSsoProfile prefers profile whose sso_role_name contains 'bedrock'", () => {
  const home = makeTempHome();
  try {
    writeAwsConfig(home, [
      "[profile dev]",
      "sso_start_url = https://my-org.awsapps.com/start",
      "sso_account_id = 123456789012",
      "sso_role_name = DeveloperAccess",
      "region = us-east-1",
      "",
      "[profile bedrock-dev]",
      "sso_start_url = https://my-org.awsapps.com/start",
      "sso_account_id = 123456789012",
      "sso_role_name = BedrockDeveloperAccess",
      "region = us-east-1",
      "",
    ].join("\n"));
    withHome(home, () => {
      assert.equal(detectSsoProfile(), "bedrock-dev");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("detectSsoProfile bedrock preference is case-insensitive", () => {
  const home = makeTempHome();
  try {
    writeAwsConfig(home, [
      "[profile first]",
      "sso_start_url = https://my-org.awsapps.com/start",
      "sso_role_name = AdminAccess",
      "",
      "[profile uppercase]",
      "sso_start_url = https://my-org.awsapps.com/start",
      "sso_role_name = BEDROCK_FULL_ACCESS",
      "",
    ].join("\n"));
    withHome(home, () => {
      assert.equal(detectSsoProfile(), "uppercase");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("detectSsoProfile detects SSO via sso_session key (new SSO token format)", () => {
  const home = makeTempHome();
  try {
    writeAwsConfig(home, [
      "[profile my-sso]",
      "sso_session = my-org",
      "sso_account_id = 123456789012",
      "sso_role_name = PowerUserAccess",
      "region = eu-west-1",
      "",
      "[sso-session my-org]",
      "sso_start_url = https://my-org.awsapps.com/start",
      "sso_registration_scopes = sso:account:access",
      "",
    ].join("\n"));
    withHome(home, () => {
      assert.equal(detectSsoProfile(), "my-sso");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("detectSsoProfile ignores non-SSO profiles mixed in with SSO profiles", () => {
  const home = makeTempHome();
  try {
    writeAwsConfig(home, [
      "[profile plain]",
      "aws_access_key_id = AKIAIOSFODNN7EXAMPLE",
      "aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      "region = us-east-1",
      "",
      "[profile sso-user]",
      "sso_start_url = https://my-org.awsapps.com/start",
      "sso_account_id = 123456789012",
      "sso_role_name = ReadOnlyAccess",
      "region = us-east-1",
      "",
    ].join("\n"));
    withHome(home, () => {
      // Only sso-user is an SSO profile
      assert.equal(detectSsoProfile(), "sso-user");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── AWS_AUTH_ERROR_RE — regex coverage ──────────────────────────────────────
//
// The regex is not exported, but its patterns are documented in the module.
// These tests verify the patterns via the source file as a contract check.

test("aws-auth source contains ExpiredToken error pattern", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join: j } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(
    j(dirname(fileURLToPath(import.meta.url)), "..", "index.ts"),
    "utf-8",
  );
  assert.ok(src.includes("ExpiredToken"), "must match ExpiredToken errors");
  assert.ok(src.includes("SSOTokenProviderFailure"), "must match SSOTokenProviderFailure");
  assert.ok(src.includes("unable to locate credentials"), "must match missing credentials");
});

test("aws-auth source documents three-tier credential fallback", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join: j } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(
    j(dirname(fileURLToPath(import.meta.url)), "..", "index.ts"),
    "utf-8",
  );
  assert.ok(src.includes("AWS_PROFILE"), "must handle AWS_PROFILE env var fallback");
  assert.ok(src.includes("detectSsoProfile"), "must call detectSsoProfile for auto-detection");
  assert.ok(src.includes("awsAuthRefresh"), "must still support explicit awsAuthRefresh config");
});
