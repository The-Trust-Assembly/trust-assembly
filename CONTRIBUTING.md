# Contributing to Trust Assembly

Thank you for your interest in contributing to Trust Assembly.

## How to Contribute

### Reporting Issues
- **Bugs**: Open an issue with steps to reproduce
- **Security vulnerabilities**: Report via email (details TBD), not public issues
- **Gaming/exploits**: If you find a way to game the scoring system, we want to know

### Pull Requests
1. Open an issue first to discuss major changes
2. Fork the repository
3. Create a feature branch
4. Test your changes
5. Submit a PR with a clear description

### Priority Areas
- **Browser extension** (Chrome/Firefox) for delivering corrections
- **API extraction** — converting window.storage calls to REST endpoints
- **Adversarial testing** — try to break the scoring system
- **Accessibility audit** — ensuring WCAG compliance
- **Documentation** — improving the tutorial and rules text
- **Internationalization** — supporting additional languages and countries

### Code Style
- The codebase is a single JSX file (~4,600 lines)
- Inline styles using CSS custom properties
- Business logic functions are async and return results
- All user-facing text should be clear, concise, and match the institutional tone

### Design Principles
- **Transparency**: Every scoring decision should be auditable
- **Asymmetry**: Wrong should always cost more than right pays
- **Independence**: No single entity should control outcomes
- **Earned trust**: Reputation comes from behavior, not identity
