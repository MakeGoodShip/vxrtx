export const colors = {
  brand: {
    50: "#edfcfe",
    100: "#d1f7fc",
    200: "#a8eef9",
    300: "#6de1f4",
    400: "#18ccf1",
    500: "#0aaecd",
    600: "#0b8bac",
    700: "#10708c",
    800: "#165b72",
    900: "#164c61",
    950: "#083242",
  },
  coal: "#111313",
} as const;

export type BrandColor = keyof typeof colors.brand;
