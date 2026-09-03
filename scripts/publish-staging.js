const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEXT_ANNOTATOR_WORKSPACE = '@soomo/text-annotator';
const REACT_TEXT_ANNOTATOR_WORKSPACE = '@soomo/react-text-annotator';
const TEXT_ANNOTATOR_TEI_WORKSPACE = '@recogito/text-annotator-tei';
const STAGING_BRANCH = 'staging';
const STAGING_TAG = 'staging';
const REMOTE_NAME = 'origin';
const TEXT_ANNOTATOR_PACKAGE_JSON = path.join(
  ROOT_DIR,
  'packages',
  'text-annotator',
  'package.json'
);

const args = process.argv.slice(2);

const options = {
  branch: undefined,
  otp: undefined,
  skipPublish: false,
  version: undefined
};

for (const arg of args) {
  if (arg === '--skip-publish') {
    options.skipPublish = true;
  } else if (arg.startsWith('--branch=')) {
    options.branch = arg.slice('--branch='.length);
  } else if (arg.startsWith('--otp=')) {
    options.otp = arg.slice('--otp='.length);
  } else if (!options.version) {
    options.version = arg;
  } else {
    throw new Error(`Unknown argument: ${arg}`);
  }
}

const run = (command, commandArgs, extraOptions = {}) => {
  const displayCommand = [command, ...commandArgs].join(' ');
  console.log(`\n> ${displayCommand}`);

  const result = spawnSync(command, commandArgs, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    ...extraOptions
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${displayCommand}`);
  }
};

const runCapture = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit']
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${[command, ...commandArgs].join(' ')}`);
  }

  return result.stdout.trim();
};

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const getCurrentBranch = () => runCapture('git', ['branch', '--show-current']);

const getReleaseBranchName = targetVersion =>
  options.branch || `release/staging-v${targetVersion}`;

const parseVersion = version => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);

  if (!match) {
    throw new Error(
      `Invalid version "${version}". Expected semver like 4.5.0-staging.0`
    );
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
  };
};

const getNextMinorStagingVersion = currentVersion => {
  const { major, minor } = parseVersion(currentVersion);
  return `${major}.${minor + 1}.0-${STAGING_TAG}.0`;
};

const isStagingPrerelease = prerelease => prerelease?.startsWith(`${STAGING_TAG}.`);

const getTargetVersion = () => {
  if (options.version) {
    const { prerelease } = parseVersion(options.version);

    if (!isStagingPrerelease(prerelease)) {
      throw new Error(
        `Invalid staging version "${options.version}". Expected a prerelease suffix like -${STAGING_TAG}.0`
      );
    }

    return options.version;
  }

  const currentVersion = readJson(TEXT_ANNOTATOR_PACKAGE_JSON).version;
  return getNextMinorStagingVersion(currentVersion);
};

const ensureCleanWorktree = () => {
  const status = runCapture('git', ['status', '--short']);

  if (status) {
    throw new Error(
      'Publishing requires a clean working tree. Commit or stash your changes first.'
    );
  }
};

const localBranchExists = branchName =>
  runCapture('git', ['branch', '--list', branchName]).length > 0;

const remoteBranchExists = branchName =>
  runCapture('git', ['ls-remote', '--heads', REMOTE_NAME, branchName]).length > 0;

const fetchRemoteBranch = branchName =>
  run('git', [
    'fetch',
    REMOTE_NAME,
    `refs/heads/${branchName}:refs/heads/${branchName}`
  ]);

const ensureReleaseBranch = targetVersion => {
  const currentBranch = getCurrentBranch();
  const releaseBranch = getReleaseBranchName(targetVersion);

  if (currentBranch === releaseBranch) {
    return releaseBranch;
  }

  if (localBranchExists(releaseBranch)) {
    run('git', ['switch', releaseBranch]);
    return releaseBranch;
  }

  if (remoteBranchExists(releaseBranch)) {
    fetchRemoteBranch(releaseBranch);
    run('git', ['switch', releaseBranch]);
    return releaseBranch;
  }

  if (currentBranch === STAGING_BRANCH) {
    run('git', ['switch', '-c', releaseBranch]);
    return releaseBranch;
  }

  if (localBranchExists(STAGING_BRANCH)) {
    run('git', ['switch', '-c', releaseBranch, STAGING_BRANCH]);
    return releaseBranch;
  }

  if (remoteBranchExists(STAGING_BRANCH)) {
    fetchRemoteBranch(STAGING_BRANCH);
    run('git', ['switch', '-c', releaseBranch, STAGING_BRANCH]);
    return releaseBranch;
  }

  throw new Error(
    `Cannot create ${releaseBranch}: neither local branch "${STAGING_BRANCH}" nor remote branch "${REMOTE_NAME}/${STAGING_BRANCH}" exists. Fetch or create "${STAGING_BRANCH}" first.`
  );
};

const publishWorkspace = workspace => {
  const publishArgs = ['publish', '--workspace', workspace, '--tag', STAGING_TAG];

  if (options.otp) {
    publishArgs.push('--otp', options.otp);
  }

  try {
    run('npm', publishArgs);
  } catch (error) {
    if (!options.otp) {
      throw new Error(
        `${error.message}\n\nIf npm requires 2FA, rerun with --otp=<code> or let npm prompt interactively.`
      );
    }

    throw error;
  }
};

const targetVersion = getTargetVersion();
const releaseBranch = getReleaseBranchName(targetVersion);

console.log(
  `Publishing ${TEXT_ANNOTATOR_WORKSPACE} and ${REACT_TEXT_ANNOTATOR_WORKSPACE} at ${targetVersion}`
);

ensureCleanWorktree();
ensureReleaseBranch(targetVersion);

run('npm', [
  'pkg',
  'set',
  `version=${targetVersion}`,
  '--workspace',
  TEXT_ANNOTATOR_WORKSPACE
]);

run('npm', ['install']);
run('npm', ['run', 'build', '--workspace', TEXT_ANNOTATOR_WORKSPACE]);

if (!options.skipPublish) {
  publishWorkspace(TEXT_ANNOTATOR_WORKSPACE);
}

run('npm', [
  'pkg',
  'set',
  `version=${targetVersion}`,
  '--workspace',
  REACT_TEXT_ANNOTATOR_WORKSPACE
]);

run('npm', [
  'install',
  '--save-exact',
  `${TEXT_ANNOTATOR_WORKSPACE}@${targetVersion}`,
  '--workspace',
  REACT_TEXT_ANNOTATOR_WORKSPACE
]);

run('npm', ['run', 'build', '--workspace', TEXT_ANNOTATOR_TEI_WORKSPACE]);
run('npm', ['run', 'build', '--workspace', REACT_TEXT_ANNOTATOR_WORKSPACE]);

if (!options.skipPublish) {
  publishWorkspace(REACT_TEXT_ANNOTATOR_WORKSPACE);
}

console.log(
  `\nDone. Both Soomo packages are now set to ${targetVersion} on ${releaseBranch}.`
);
