**When a call fails, decide by whether it ran.**

- **It never ran**: the tool is missing, or validation or authentication
  rejected the call before dispatch. Fall back to the other path at once.
- **Its outcome is unknown**: a dropped connection, a timeout, or a reply you
  cannot parse. A read-only operation may fall back at once. A write may
  already have landed, so before retrying it on either path, look for what it
  would have made: the issue (search for its exact title), the link (read the
  parent's sub-issues or the issue's blockers), or the reply (list the
  comments and look for its response marker). Make the write only if that
  check finds nothing.
