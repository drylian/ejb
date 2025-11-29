# Directives

Kire supports powerful directives for control flow and logic.

## Conditionals

```html
@if(user.isLoggedIn)
  <p>Welcome back!</p>
@else
  <p>Please log in.</p>
@end
```

## Loops

```html
@for(item of items)
  <li>{{ item.name }}</li>
@end
```
