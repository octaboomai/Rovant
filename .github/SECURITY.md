# Security Policy

## Supported Versions
| Version | Security fixes |
|---|---|
| 0.1.x   | ✅ Active      |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: **security@o1ide.dev**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

We will respond within **48 hours** and aim to release a patch within **14 days** for critical issues.

## Scope
- The Electron shell (`o1-app/`)
- The Theia extension (`o1-extension/`)
- The REST backend endpoints (`/o1/*`)
- The build pipeline and CI/CD configuration

## Out of Scope
- Third-party packages (report to their maintainers)
- The user's ROS 2 environment
- Issues requiring physical access to the device
