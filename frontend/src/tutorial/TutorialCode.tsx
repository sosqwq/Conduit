import type { ComponentProps } from 'react'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import http from 'highlight.js/lib/languages/http'
import java from 'highlight.js/lib/languages/java'
import json from 'highlight.js/lib/languages/json'
import nginx from 'highlight.js/lib/languages/nginx'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

for (const [language, grammar] of Object.entries({ bash, css, dockerfile, http, java, json, nginx, python, sql, typescript, xml, yaml })) {
  hljs.registerLanguage(language, grammar)
}
hljs.registerAliases('hurl', { languageName: 'http' })

export function TutorialCode({ className, children }: ComponentProps<'code'>) {
  const language = /(?:^|\s)language-([\w-]+)/.exec(className ?? '')?.[1]
  if (!language || !hljs.getLanguage(language)) {
    return <code className={className}>{children}</code>
  }
  const html = hljs.highlight(String(children), { language }).value
  return <code className={`hljs ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
