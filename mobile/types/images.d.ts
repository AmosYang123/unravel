// Metro resolves image imports to a numeric asset id (or a { uri } object on
// web), but nothing in this project's type packages declares that for
// TypeScript — react-native's own types stopped shipping it. This is the one
// declaration needed to import `logo-unravel.png` from index.tsx.
declare module "*.png" {
  const value: number;
  export default value;
}
