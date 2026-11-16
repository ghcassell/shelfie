import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { IconName } from "./components";
import { color, font, radius, space } from "./theme";

const icon =
    (name: IconName, outline: IconName) =>
    function TabIcon({ focused, size }: { focused: boolean; size: number }) {
        return (
            <MaterialCommunityIcons
                name={focused ? name : outline} // selected = filled glyph, so it's not colour-only
                size={size}
                color={focused ? color.primary : color.inkMuted}
            />
        );
    };

/** Larder, Shopping, Needs attention (with badge). Settings and Waste report live in the Larder's overflow menu. */
export function BottomTabs({ attentionCount }: { attentionCount: number }) {
    const insets = useSafeAreaInsets();
    const pad = 4; // vertical padding around the tab items
    const item = 58; // default is 49; the extra sits below the label, inside the selected pill
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarHideOnKeyboard: true, // otherwise it rides on top of the keyboard (Larder search, Shopping add)
                tabBarActiveTintColor: color.primary,
                tabBarInactiveTintColor: color.inkMuted,
                tabBarActiveBackgroundColor: color.tint,
                // pill: narrower than the tab slot, rounded (overflow clips the background)
                tabBarItemStyle: {
                    marginHorizontal: space.md,
                    borderRadius: radius.md,
                    overflow: "hidden",
                },
                tabBarLabelStyle: { fontSize: font.xs },
                tabBarStyle: {
                    borderTopColor: color.brand,
                    height: item + pad * 2 + insets.bottom,
                    paddingTop: pad,
                    paddingBottom: insets.bottom + pad,
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: "Larder",
                    tabBarIcon: icon("fridge", "fridge-outline"),
                }}
            />
            <Tabs.Screen
                name="shopping"
                options={{
                    title: "Shopping",
                    tabBarIcon: icon("cart", "cart-outline"),
                }}
            />
            <Tabs.Screen
                name="attention"
                options={{
                    title: "Needs attention",
                    tabBarIcon: icon("alert-circle", "alert-circle-outline"),
                    tabBarBadge: attentionCount || undefined,
                    tabBarBadgeStyle: {
                        backgroundColor: color.red,
                        color: "#fff",
                    },
                }}
            />
        </Tabs>
    );
}
