# Security Policy

## Supported Versions

Pui is currently pre-1.0. Security fixes are prioritized on the default branch
and included in the next available release or source update.

| Version | Supported |
| ------- | --------- |
| main    | Yes       |
| < 1.0 releases | Best effort |

## Reporting a Vulnerability

Please do not open a public issue for security-sensitive reports.

Use GitHub's private vulnerability reporting for this repository if it is
enabled. If private reporting is not available, contact the maintainers through
the repository's listed private contact channel and include "Security" in the
subject.

Helpful reports include:

- A clear description of the vulnerability and affected behavior.
- Reproduction steps or a proof of concept.
- Impact, including what data or local resources could be affected.
- Your environment, including operating system, Node.js version, and Pui version or commit.
- Any suggested remediation, if known.

Maintainers will acknowledge valid reports as soon as practical, work with you on
responsible disclosure timing, and avoid public discussion until a fix or
mitigation is available.

## Security Considerations

Pui interacts with local terminals, filesystems, and Git repositories. Please pay
special attention to reports involving command execution, path handling,
credential exposure, untrusted repository contents, and destructive Git or file
operations.
