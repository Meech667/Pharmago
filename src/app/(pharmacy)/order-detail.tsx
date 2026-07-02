import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackground } from '@/components/ambient-background';
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDocument,
  IconMapPin,
  IconX,
} from '@/components/icons';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { ORDER_STATUS_CONFIG } from '@/constants/order-status';
import { FontFamily, Radius, Spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  acceptOrder,
  listenClientOrder,
  rejectOrder,
  type FirestoreOrder,
} from '@/services/orders';
import { getDeliveryProfile } from '@/services/reviews';

// ── Toast ────────────────────────────────────────────────────────────────────

function Toast({ visible, styles }: { visible: boolean; styles: ReturnType<typeof createStyles> }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);
  const scale = useSharedValue(0.95);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 400 });
      translateY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });
      scale.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
    }
  }, [visible, opacity, translateY, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.toast, style]} pointerEvents="none">
      <View style={styles.toastIcon}>
        <IconCheck size={16} color="#8fe0b8" strokeWidth={2.3} />
      </View>
      <View>
        <Text style={styles.toastTitle}>Commande validée</Text>
        <Text style={styles.toastSub}>Le client a été notifié</Text>
      </View>
    </Animated.View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [order, setOrder] = useState<FirestoreOrder | null | 'not-found'>(null);
  const [accepted, setAccepted] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rxModalImage, setRxModalImage] = useState<string | null>(null);
  const [showRejectSheet, setShowRejectSheet] = useState(false);
  const [customReason, setCustomReason] = useState('');
  const [deliveryProfile, setDeliveryProfile] = useState<{ name: string; rating: number } | null>(null);

  useEffect(() => {
    if (!id) { setOrder('not-found'); return; }
    const unsub = listenClientOrder(id, setOrder);
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!order || order === 'not-found' || order.status !== 'delivered' || !order.deliveryId) {
      setDeliveryProfile(null);
      return;
    }
    getDeliveryProfile(order.deliveryId).then(setDeliveryProfile).catch(() => setDeliveryProfile(null));
  }, [order]);

  async function handleOpenPdf(base64: string, name: string) {
    try {
      const filename = name.endsWith('.pdf') ? name : `${name}.pdf`;
      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true });
      file.write(base64, { encoding: 'base64' });
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Ouvrir l\'ordonnance' });
    } catch {
      Alert.alert('Erreur', "L'ordonnance n'a pas pu être ouverte.");
    }
  }

  async function handleAccept() {
    if (!id || actionLoading || !order || order === 'not-found') return;
    setActionLoading(true);
    try {
      await acceptOrder(id);
      setAccepted(true);
      setTimeout(() => router.back(), 1800);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(reason: string) {
    if (!id || actionLoading) return;
    setActionLoading(true);
    try {
      await rejectOrder(id, reason);
      setShowRejectSheet(false);
      router.back();
    } finally {
      setActionLoading(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (order === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <AmbientBackground />
        <View style={styles.centerState}>
          <Text style={styles.stateText}>Chargement…</Text>
        </View>
      </View>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────
  if (order === 'not-found') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <AmbientBackground />
        <Pressable onPress={() => router.back()} style={[styles.backBtnAbsolute, { top: insets.top + 12 }]}>
          <IconChevronLeft size={16} color={colors.text.primary} strokeWidth={2.3} />
        </Pressable>
        <View style={styles.centerState}>
          <Text style={styles.stateText}>Commande introuvable</Text>
        </View>
      </View>
    );
  }

  const isPending = order.status === 'pending';
  const orderRef = `#CMD-${order.id.slice(-6).toUpperCase()}`;
  const minutesAgo = order.createdAt
    ? Math.round((Date.now() - order.createdAt.toMillis()) / 60000)
    : 0;
  const timeLabel = minutesAgo < 60
    ? `Il y a ${minutesAgo} min`
    : `Il y a ${Math.round(minutesAgo / 60)}h`;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <AmbientBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: isPending && !accepted ? insets.bottom + 130 : insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back row */}
        <View style={styles.backRow}>
          <Pressable onPress={() => router.back()}>
            <GlassCard style={styles.backBtn} radius={12}>
              <IconChevronLeft size={16} color={colors.text.primary} strokeWidth={2.3} />
            </GlassCard>
          </Pressable>
          <Text style={styles.backLabel}>Commande {orderRef}</Text>
        </View>

        {/* Hero card */}
        <GlassCard strong style={styles.hero} radius={Radius.xl}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroId}>Client</Text>
            <View style={[
              styles.statusBadge,
              {
                backgroundColor: `${ORDER_STATUS_CONFIG[order.status].color}22`,
                borderColor: `${ORDER_STATUS_CONFIG[order.status].color}4D`,
              },
            ]}>
              <Text style={[styles.statusText, { color: ORDER_STATUS_CONFIG[order.status].color }]}>
                {ORDER_STATUS_CONFIG[order.status].label}
              </Text>
            </View>
          </View>
          <Text style={styles.heroName}>{order.clientName}</Text>
          <Text style={styles.heroTime}>{timeLabel}</Text>
          <View style={styles.heroPriceRow}>
            <Text style={styles.heroMeta}>
              {order.items.length} produit{order.items.length > 1 ? 's' : ''}
              {order.hasOrdonnance ? ' · Ordonnance jointe' : ''}
            </Text>
            <Text style={styles.heroPrice}>
              {(order.totalPrice ?? 0).toFixed(2).replace('.', ',')}€
            </Text>
          </View>
        </GlassCard>

        {/* Adresse de livraison */}
        <Text style={styles.sectionLabel}>Adresse de livraison</Text>
        <GlassCard style={styles.rxBadge} radius={Radius.md}>
          <IconMapPin size={19} color={colors.amberBright} strokeWidth={1.7} />
          <View style={styles.rxInfo}>
            <Text style={styles.rxTitle}>
              {order.deliveryAddress
                ? `${order.deliveryAddress.street}, ${order.deliveryAddress.zipCode} ${order.deliveryAddress.city}`
                : 'Non renseignée'}
            </Text>
          </View>
        </GlassCard>

        {/* Ordonnances */}
        {order.hasOrdonnance && (
          <>
            <Text style={styles.sectionLabel}>
              Ordonnance{(order.ordonnances?.length ?? 0) > 1 ? 's' : ''}
            </Text>
            {(order.ordonnances?.length ?? 0) === 0 ? (
              <GlassCard style={styles.rxBadge} radius={Radius.md}>
                <IconDocument size={19} color={colors.sage} strokeWidth={1.7} />
                <View style={styles.rxInfo}>
                  <Text style={styles.rxTitle}>En attente de transmission</Text>
                  <Text style={styles.rxSub}>Le client n'a pas encore envoyé son ordonnance</Text>
                </View>
              </GlassCard>
            ) : (
              order.ordonnances.map((ord, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => {
                    if (ord.type === 'pdf') {
                      handleOpenPdf(ord.base64, ord.name ?? 'ordonnance.pdf');
                    } else {
                      setRxModalImage(ord.base64);
                    }
                  }}
                >
                  <GlassCard style={styles.rxBadge} radius={Radius.md}>
                    <IconDocument size={19} color={colors.sage} strokeWidth={1.7} />
                    <View style={styles.rxInfo}>
                      <Text style={styles.rxTitle}>{ord.title}</Text>
                      <Text style={styles.rxSub}>
                        {ord.type === 'pdf' ? 'Document PDF' : 'Image'} · {ord.name}
                      </Text>
                    </View>
                    <IconChevronRight size={15} color={colors.text.tertiary} strokeWidth={2} />
                  </GlassCard>
                </Pressable>
              ))
            )}
          </>
        )}

        {/* Modal ordonnance (image) */}
        <Modal visible={!!rxModalImage} transparent animationType="fade" onRequestClose={() => setRxModalImage(null)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setRxModalImage(null)}>
            {rxModalImage && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${rxModalImage}` }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            )}
          </Pressable>
        </Modal>

        {/* Bottom sheet motif de refus */}
        <Modal visible={showRejectSheet} transparent animationType="slide" onRequestClose={() => setShowRejectSheet(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowRejectSheet(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Motif du refus</Text>
              {['Ordonnance manquante', 'Ordonnance illisible', 'Ordonnance expirée', 'Produit non disponible'].map((reason) => (
                <Pressable key={reason} style={styles.sheetOption} onPress={() => handleReject(reason)}>
                  <Text style={styles.sheetOptionText}>{reason}</Text>
                </Pressable>
              ))}
              <View style={styles.sheetCustomRow}>
                <TextInput
                  style={styles.sheetInput}
                  value={customReason}
                  onChangeText={setCustomReason}
                  placeholder="Autre motif…"
                  placeholderTextColor={colors.text.tertiary}
                />
                <Pressable
                  style={styles.sheetCustomBtn}
                  onPress={() => customReason.trim() && handleReject(customReason.trim())}
                >
                  <Text style={styles.sheetCustomBtnText}>Envoyer</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Produits */}
        <Text style={styles.sectionLabel}>Produits</Text>
        {order.items.map((item, i) => (
          <GlassCard key={i} style={styles.medRow} radius={Radius.md}>
            <View style={styles.medLeft}>
              <Text style={styles.medName}>{item.name}</Text>
              <Text style={styles.medPrice}>{(item.price ?? 0).toFixed(2)} € / unité</Text>
            </View>
            <Text style={styles.medQty}>×{item.quantity}</Text>
          </GlassCard>
        ))}

        {/* Total */}
        <GlassCard style={styles.totalBreakdown} radius={Radius.md}>
          <View style={styles.totalRow}>
            <Text style={styles.totalRowLabel}>Sous-total médicaments</Text>
            <Text style={styles.totalRowValue}>
              {((order.totalPrice ?? 0) - (order.deliveryFee ?? 0)).toFixed(2)} €
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalRowLabel}>Frais de livraison</Text>
            <Text style={styles.totalRowValue}>{(order.deliveryFee ?? 0).toFixed(2)} €</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total commande</Text>
            <Text style={styles.totalValue}>{(order.totalPrice ?? 0).toFixed(2)} €</Text>
          </View>
        </GlassCard>

        {/* Statut final */}
        {order.status === 'delivered' && (
          <>
            <Text style={styles.sectionLabel}>Livreur</Text>
            <GlassCard style={styles.rxBadge} radius={Radius.md}>
              <View style={styles.rxInfo}>
                <Text style={styles.rxTitle}>{deliveryProfile?.name ?? 'Livreur'}</Text>
                <Text style={styles.rxSub}>
                  Note {deliveryProfile?.rating ?? '—'}⭐ · Livrée le{' '}
                  {order.updatedAt ? new Date(order.updatedAt.toMillis()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                </Text>
              </View>
            </GlassCard>
          </>
        )}

        {order.status === 'cancelled' && (
          <GlassCard style={styles.statusInfoCard} radius={Radius.md}>
            <Text style={styles.statusInfoTitle}>Annulée par le client</Text>
            <Text style={styles.statusInfoSub}>
              {order.updatedAt ? new Date(order.updatedAt.toMillis()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
            </Text>
          </GlassCard>
        )}

        {order.status === 'rejected' && (
          <GlassCard style={styles.statusInfoCard} radius={Radius.md}>
            <Text style={styles.statusInfoTitle}>Refusée</Text>
            <Text style={styles.statusInfoSub}>
              {order.refusalReason ?? 'Aucun motif renseigné'}
              {order.updatedAt ? ` · ${new Date(order.updatedAt.toMillis()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
            </Text>
          </GlassCard>
        )}
      </ScrollView>

      {/* Action row — only if still pending */}
      {isPending && !accepted && (
        <View style={[styles.actionRow, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.rejectBtn}>
            <SecondaryButton
              label="Refuser"
              onPress={() => setShowRejectSheet(true)}
              variant="reject"
              icon={<IconX size={14} color="#f0a89e" strokeWidth={2.3} />}
            />
          </View>
          <View style={styles.acceptBtn}>
            <PrimaryButton
              label="Valider"
              onPress={handleAccept}
              loading={actionLoading}
              icon={<IconCheck size={14} color="#221204" strokeWidth={2.4} />}
            />
          </View>
        </View>
      )}

      <Toast visible={accepted} styles={styles} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg.surface,
    },
    content: {
      paddingHorizontal: Spacing.xl,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateText: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 15,
      color: colors.text.tertiary,
    },
    backBtnAbsolute: {
      position: 'absolute',
      left: Spacing.xl,
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.glass,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 18,
    },
    backBtn: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backLabel: {
      fontFamily: FontFamily.sansBold,
      fontSize: 12.5,
      color: colors.text.tertiary,
    },
    hero: {
      padding: 24,
      marginBottom: 16,
      borderColor: colors.border.glassStrong,
      gap: 4,
    },
    heroTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    heroId: {
      fontFamily: FontFamily.sansExtraBold,
      fontSize: 10.5,
      color: colors.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    statusBadge: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: Radius.pill,
      borderWidth: 1,
    },
    statusText: {
      fontFamily: FontFamily.sansBold,
      fontSize: 11,
    },
    heroName: {
      fontFamily: FontFamily.serif,
      fontSize: 25,
      color: colors.text.primary,
      marginBottom: 4,
    },
    heroTime: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 12,
      color: colors.text.tertiary,
      marginBottom: 14,
    },
    heroPriceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    heroMeta: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 12.5,
      color: colors.text.secondary,
      flex: 1,
    },
    heroPrice: {
      fontFamily: FontFamily.serif,
      fontSize: 30,
      color: colors.amberBright,
    },
    sectionLabel: {
      fontFamily: FontFamily.sansExtraBold,
      fontSize: 11.5,
      color: colors.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginTop: 16,
      marginBottom: 9,
    },
    rxBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 13,
      paddingHorizontal: 16,
      marginBottom: 7,
    },
    rxInfo: { flex: 1 },
    fallbackLink: {
      alignSelf: 'center',
      paddingVertical: 10,
      marginBottom: 4,
    },
    fallbackLinkText: {
      fontFamily: FontFamily.sansBold,
      fontSize: 12,
      color: colors.sage,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalImage: {
      width: '92%',
      height: '80%',
    },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.bg.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      padding: Spacing.xl,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border.glass,
    },
    sheetTitle: {
      fontFamily: FontFamily.serif,
      fontSize: 18,
      color: colors.text.primary,
      marginBottom: 6,
    },
    sheetOption: {
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.glass,
    },
    sheetOptionText: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 14.5,
      color: colors.text.primary,
    },
    sheetCustomRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    sheetInput: {
      flex: 1,
      fontFamily: FontFamily.sansMedium,
      fontSize: 13.5,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.glass,
      borderRadius: Radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    sheetCustomBtn: {
      backgroundColor: colors.amberBright,
      borderRadius: Radius.md,
      paddingHorizontal: 16,
      justifyContent: 'center',
    },
    sheetCustomBtnText: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13,
      color: '#221204',
    },
    rxTitle: {
      fontFamily: FontFamily.sansBold,
      fontSize: 12.5,
      color: colors.text.primary,
    },
    rxSub: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 11,
      color: colors.text.tertiary,
      marginTop: 1,
    },
    medRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 13,
      paddingHorizontal: 16,
      marginBottom: 7,
    },
    medLeft: { flex: 1, gap: 2 },
    medName: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13.5,
      color: colors.text.primary,
    },
    medPrice: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 11.5,
      color: colors.text.tertiary,
    },
    medQty: {
      fontFamily: FontFamily.sansSemiBold,
      fontSize: 14,
      color: colors.amberBright,
    },
    totalBreakdown: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginTop: 4,
      marginBottom: 8,
      gap: 10,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    totalRowLabel: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 13,
      color: colors.text.secondary,
    },
    totalRowValue: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13,
      color: colors.text.primary,
    },
    totalDivider: {
      height: 1,
      backgroundColor: colors.border.glass,
    },
    totalLabel: {
      fontFamily: FontFamily.sansBold,
      fontSize: 14,
      color: colors.text.primary,
    },
    totalValue: {
      fontFamily: FontFamily.serif,
      fontSize: 22,
      color: colors.amberBright,
    },
    statusInfoCard: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginTop: 4,
      marginBottom: 8,
      gap: 4,
    },
    statusInfoTitle: {
      fontFamily: FontFamily.sansBold,
      fontSize: 14,
      color: colors.text.primary,
    },
    statusInfoSub: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 12.5,
      color: colors.text.tertiary,
    },
    actionRow: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: Spacing.xl,
      paddingTop: 20,
      backgroundColor: colors.bg.surface,
    },
    rejectBtn: { flex: 1 },
    acceptBtn: { flex: 1 },
    toast: {
      position: 'absolute',
      bottom: 118,
      left: Spacing.xl,
      right: Spacing.xl,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: Radius.lg,
      backgroundColor: 'rgba(127,184,158,0.15)',
      borderWidth: 1,
      borderColor: 'rgba(127,184,158,0.35)',
    },
    toastIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: 'rgba(127,184,158,0.3)',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    toastTitle: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13.5,
      color: colors.text.primary,
    },
    toastSub: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 11.5,
      color: colors.text.tertiary,
      marginTop: 1,
    },
  });
}
