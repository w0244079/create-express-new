# Security Policy

## Supported versions

Security fixes are released for the latest version of `create-express-new` on npm. Older versions
are not patched, so update to the latest version first.

## Reporting a vulnerability

Please do not report security vulnerabilities in public issues, discussions or pull requests.

Report them privately with GitHub's
[private vulnerability reporting](https://github.com/w0244079/create-express-new/security/advisories/new)
(the **Report a vulnerability** button on the repository's Security tab). Include:

- the version of `create-express-new`, Node.js and the package manager
- the command or wizard answers that reproduce the problem
- what an attacker could do, and any fix you have in mind

## What is in scope

- the generator itself: the command line, the wizard, and how it writes files
- the code and configuration of the apps it generates, such as a template that is insecure by
  default

A vulnerability in a package that generated apps depend on, such as Express, should be reported to
that package. Do report it here if the generator still installs a vulnerable version once a fixed
one is available.

## What to expect

- an acknowledgement within 7 days
- an assessment, and a plan for a fix if the report is accepted, within 30 days
- a fixed release and a published security advisory that credits you, unless you prefer otherwise

Please keep the details private until the fix is released. If a report is declined, you will be
told why.
