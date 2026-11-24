import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
    FlatList,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import Toast from "react-native-toast-message";
import { useLarder } from "../../db/queries";
import { updateBatch } from "../../db/repositories";
import { matchesSearch, TO_PUT_AWAY } from "../../domain/larder";
import { sync, useSyncStatus } from "../../sync";
import {
    Banner,
    Chip,
    EmptyState,
    FAB,
    IconButton,
    ListRow,
    s,
    ScreenHeader,
    Sheet,
} from "../../ui/components";
import { color, space } from "../../ui/theme";
import { BatchItem } from "./BatchItem";

export default function LarderScreen() {
    const { larder, attention, locations, today } = useLarder();
    const { status } = useSyncStatus();
    const [query, setQuery] = useState("");
    const [pickedLocationId, setLocationId] = useState<string | null>(null); // a Location id, or TO_PUT_AWAY
    const toPutAway = larder.filter((r) => !r.batch.locationId).length;
    // Once the last one is put away the chip goes, and its filter with it.
    const locationId =
        pickedLocationId === TO_PUT_AWAY && !toPutAway ? null : pickedLocationId;
    const [openedOnly, setOpenedOnly] = useState(false);
    const [adding, setAdding] = useState(false);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const selectMode = picked.size > 0;
    // Stable identity (not a fresh closure per render) so BatchItem's memo only re-renders the row that changed,
    // not every visible row, on each tap.
    const toggle = useCallback((id: string) => {
        setPicked((s) => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
        });
    }, []);
    const moveTo = (id: string | null, label: string) => {
        const n = picked.size;
        picked.forEach((batchId) => updateBatch(batchId, { locationId: id }));
        setPicked(new Set());
        Toast.show({ type: "success", text1: `Moved ${n} ${n === 1 ? "item" : "items"} to ${label}` });
    };

    const rows = larder.filter(
        (r) =>
            matchesSearch(r, query) &&
            (!locationId ||
                (r.batch.locationId ?? TO_PUT_AWAY) === locationId) &&
            (!openedOnly || !!r.batch.openedOn),
    );
    const filtered = !!query || !!locationId || openedOnly;
    const anyExpired = attention.some((r) => r.urgency === "expired");
    const go = (path: "/add" | "/receipt") => {
        setAdding(false);
        router.push(path);
    };

    return (
        <View style={s.screen}>
            <ScreenHeader
                title="Shelfie"
                logo
                right={
                    status === "unavailable" ? (
                        <IconButton
                            icon="cloud-off-outline"
                            label="Sync unavailable. Open Settings"
                            tint={color.red}
                            onPress={() => router.push("/settings")}
                        />
                    ) : undefined
                }
                menu={[
                    {
                        label: "Settings",
                        onPress: () => router.push("/settings"),
                    },
                    {
                        label: "Waste report",
                        onPress: () => router.push("/waste"),
                    },
                    // The table needs a wide window, so only the browser offers it.
                    ...(Platform.OS === "web"
                        ? [
                              {
                                  label: "Tidy up (table)",
                                  onPress: () => router.push("/tidy"),
                              },
                          ]
                        : []),
                ]}
            >
            {larder.length > 0 && (
                <>
                    <View
                        style={{
                            marginHorizontal: space.screen,
                            justifyContent: "center",
                        }}
                    >
                        <TextInput
                            style={[s.input, { paddingLeft: 44, paddingRight: 44 }]}
                            placeholder="Search name or brand"
                            placeholderTextColor={color.placeholder}
                            value={query}
                            onChangeText={setQuery}
                            accessibilityLabel="Search the larder"
                            returnKeyType="search"
                        />
                        <MaterialCommunityIcons
                            name="magnify"
                            size={22}
                            color={color.placeholder}
                            style={{
                                position: "absolute",
                                left: space.md,
                                pointerEvents: "none",
                            }}
                        />
                        {query.length > 0 && (
                            <Pressable
                                onPress={() => setQuery("")}
                                accessibilityRole="button"
                                accessibilityLabel="Clear search"
                                hitSlop={8}
                                style={{ position: "absolute", right: space.md }}
                            >
                                <MaterialCommunityIcons
                                    name="close"
                                    size={22}
                                    color={color.inkMuted}
                                />
                            </Pressable>
                        )}
                    </View>
                    <View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{
                                gap: space.sm,
                                paddingHorizontal: space.screen,
                            }}
                        >
                            {toPutAway > 0 && (
                                <Chip
                                    warn
                                    label={`${TO_PUT_AWAY} (${toPutAway})`}
                                    selected={locationId === TO_PUT_AWAY}
                                    onPress={() =>
                                        setLocationId(
                                            locationId === TO_PUT_AWAY
                                                ? null
                                                : TO_PUT_AWAY,
                                        )
                                    }
                                />
                            )}
                            <Chip
                                label="Opened"
                                selected={openedOnly}
                                onPress={() => setOpenedOnly(!openedOnly)}
                            />
                            {locations.map((l) => (
                                <Chip
                                    key={l.id}
                                    label={l.name}
                                    selected={locationId === l.id}
                                    onPress={() =>
                                        setLocationId(
                                            locationId === l.id ? null : l.id,
                                        )
                                    }
                                />
                            ))}
                        </ScrollView>
                    </View>
                </>
            )}
            {attention.length > 0 && (
                <Banner
                    tone={anyExpired ? "red" : "amber"}
                    text={`${attention.length} ${attention.length === 1 ? "needs" : "need"} attention`}
                    onPress={() => router.push("/attention")}
                />
            )}
            </ScreenHeader>
            <FlatList
                data={rows}
                keyExtractor={(r) => r.batch.id}
                // Selecting flips a checkbox glyph and an edge strip on the row, which can nudge its measured
                // height by a sub-pixel with no getItemLayout to fall back on; without this, FlatList "corrects"
                // the scroll offset to match and the list visibly jumps under your thumb.
                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                renderItem={({ item }) => (
                    <BatchItem
                        row={item}
                        today={today}
                        selectMode={selectMode}
                        selected={picked.has(item.batch.id)}
                        onToggle={toggle}
                    />
                )}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 96 }}
                refreshControl={
                    <RefreshControl
                        refreshing={status === "syncing"}
                        onRefresh={sync}
                    />
                }
                ListEmptyComponent={
                    filtered ? (
                        <EmptyState
                            icon="filter-off-outline"
                            text="Nothing matches."
                            actionLabel="Clear filters"
                            onAction={() => {
                                setQuery("");
                                setLocationId(null);
                                setOpenedOnly(false);
                            }}
                        />
                    ) : (
                        <EmptyState
                            icon="barcode-scan"
                            text="Your larder is empty. Scan your first item."
                            actionLabel="Scan"
                            onAction={() => router.push("/add")}
                        />
                    )
                }
            />
            {selectMode ? (
                <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: color.tintMuted, borderTopWidth: 1, borderTopColor: color.line, paddingVertical: space.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.screen, gap: space.sm }}>
                        <IconButton icon="close" label="Cancel selection" onPress={() => setPicked(new Set())} />
                        <Text style={s.rowTitle}>{picked.size} selected</Text>
                    </View>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.screen, paddingVertical: space.xs }}
                    >
                        <Chip warn label="Put away later" onPress={() => moveTo(null, TO_PUT_AWAY)} />
                        {locations.map((l) => (
                            <Chip key={l.id} label={`Move to ${l.name}`} onPress={() => moveTo(l.id, l.name)} />
                        ))}
                    </ScrollView>
                </View>
            ) : (
                <FAB label="Add to the larder" onPress={() => setAdding(true)} />
            )}
            <Sheet
                visible={adding}
                onClose={() => setAdding(false)}
                title="Add"
            >
                <ListRow
                    title="Add items"
                    subtitle="Scan barcodes or enter by hand"
                    onPress={() => go("/add")}
                />
                <ListRow
                    title="Add from a receipt"
                    subtitle="Add everything on a till receipt"
                    onPress={() => go("/receipt")}
                />
            </Sheet>
        </View>
    );
}
