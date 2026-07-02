import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackground } from '@/components/ambient-background';
import {
  IconCamera,
  IconChevronLeft,
  IconDocument,
  IconImage,
  IconPaperclip,
  IconSend,
} from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { FontFamily, Radius, Spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import {
  listenConversation,
  listenMessages,
  markAsRead,
  sendMessage,
  type ChatMessage,
  type ConversationDoc,
} from '@/services/chat';

// Mirrors the ordonnance pipeline in order.tsx — keeps base64 docs well under
// Firestore's 1MiB limit since Firebase Storage now requires the paid Blaze plan.
async function resizeImageToBase64(uri: string): Promise<string> {
  const image = await ImageManipulator.manipulate(uri).resize({ width: 1200 }).renderAsync();
  const result = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!result.base64) throw new Error('No base64 output from image manipulator');
  return result.base64;
}

const MAX_PDF_BASE64_LENGTH = 700_000;

function formatMessageTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({ message, isMine, onOpenImage }: { message: ChatMessage; isMine: boolean; onOpenImage: (uri: string) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {message.attachmentType === 'image' && message.attachmentBase64 && (
          <Pressable onPress={() => onOpenImage(`data:image/jpeg;base64,${message.attachmentBase64}`)}>
            <Image
              source={{ uri: `data:image/jpeg;base64,${message.attachmentBase64}` }}
              style={styles.attachmentImage}
            />
          </Pressable>
        )}
        {message.attachmentType === 'pdf' && message.attachmentBase64 && (
          <Pressable
            style={styles.attachmentDoc}
            onPress={async () => {
              try {
                const filename = message.attachmentName?.endsWith('.pdf') ? message.attachmentName : `${message.attachmentName ?? 'document'}.pdf`;
                const file = new File(Paths.cache, filename);
                file.create({ overwrite: true });
                file.write(message.attachmentBase64!, { encoding: 'base64' });
                await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Ouvrir le document' });
              } catch {
                Alert.alert('Erreur', "Le document n'a pas pu être ouvert.");
              }
            }}
          >
            <IconDocument size={18} color={isMine ? '#221204' : colors.sage} strokeWidth={1.8} />
            <Text style={[styles.attachmentDocName, isMine && { color: '#221204' }]} numberOfLines={1}>
              {message.attachmentName ?? 'Document.pdf'}
            </Text>
          </Pressable>
        )}
        {!!message.text && (
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
            {message.text}
          </Text>
        )}
      </View>
      <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs]}>
        {message.createdAt ? formatMessageTime(message.createdAt.toMillis()) : ''}
      </Text>
    </View>
  );
}

export function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();

  const [conversation, setConversation] = useState<ConversationDoc | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [processingAttachment, setProcessingAttachment] = useState(false);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    const unsub = listenConversation(conversationId, setConversation);
    return unsub;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const unsub = listenMessages(conversationId, setMessages);
    return unsub;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !user) return;
    markAsRead(conversationId, user.uid);
  }, [conversationId, user, messages.length]);

  if (!user || !conversationId) return null;

  const myUid = user.uid;
  const myName = user.name;
  const otherUid = conversation?.participants.find((p) => p !== user.uid) ?? '';
  const otherName = conversation?.participantNames?.[otherUid] ?? '…';
  const otherRole = conversation?.participantRoles?.[otherUid] ?? 'client';
  const roles = conversation ? Object.values(conversation.participantRoles ?? {}) : [];
  const isClientDeliveryPair = roles.includes('client') && roles.includes('delivery');

  async function handleSendText() {
    if (!text.trim() || sending) return;
    setSending(true);
    const value = text;
    setText('');
    try {
      await sendMessage(conversationId, myUid, myName, value);
    } catch {
      setText(value);
      Alert.alert('Erreur', "Le message n'a pas pu être envoyé.");
    } finally {
      setSending(false);
    }
  }

  async function handleSendAttachment(attachment: { base64: string; type: 'image' | 'pdf'; name: string }) {
    try {
      await sendMessage(conversationId, myUid, myName, '', attachment);
    } catch {
      Alert.alert('Erreur', "Le fichier n'a pas pu être envoyé.");
    }
  }

  // Waits for the BottomSheet Modal (280ms close animation) to fully dismiss
  // before opening any native picker — iOS crashes if two native modals overlap.
  function closeSheetThen(fn: () => void) {
    setAttachSheetVisible(false);
    setTimeout(fn, 350);
  }

  function handleTakePhoto() {
    closeSheetThen(async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission refusée', "L'accès à la caméra est nécessaire pour prendre une photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      setProcessingAttachment(true);
      try {
        const base64 = await resizeImageToBase64(result.assets[0].uri);
        await handleSendAttachment({ base64, type: 'image', name: `photo_${Date.now()}.jpg` });
      } catch {
        Alert.alert('Erreur', "La photo n'a pas pu être traitée.");
      } finally {
        setProcessingAttachment(false);
      }
    });
  }

  function handlePickFromGallery() {
    closeSheetThen(async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission refusée', "L'accès à la galerie est nécessaire pour choisir une photo.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      setProcessingAttachment(true);
      try {
        const base64 = await resizeImageToBase64(result.assets[0].uri);
        await handleSendAttachment({ base64, type: 'image', name: `photo_${Date.now()}.jpg` });
      } catch {
        Alert.alert('Erreur', "La photo n'a pas pu être traitée.");
      } finally {
        setProcessingAttachment(false);
      }
    });
  }

  function handlePickPdf() {
    closeSheetThen(async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setProcessingAttachment(true);
      try {
        const base64 = await new File(asset.uri).base64();
        if (base64.length > MAX_PDF_BASE64_LENGTH) {
          Alert.alert('Fichier trop volumineux', 'Choisissez un PDF de moins de 500 Ko.');
          return;
        }
        await handleSendAttachment({ base64, type: 'pdf', name: asset.name });
      } catch {
        Alert.alert('Erreur', "Le fichier n'a pas pu être traité.");
      } finally {
        setProcessingAttachment(false);
      }
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <AmbientBackground />

      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <IconChevronLeft size={18} color={colors.text.secondary} strokeWidth={2.2} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Avatar name={otherName} role={otherRole} size={36} />
          <Text style={styles.headerName} numberOfLines={1}>{otherName}</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {isClientDeliveryPair && conversation?.orderId && (
        <View style={styles.orderBanner}>
          <Text style={styles.orderBannerText}>
            Commande #{conversation.orderId.slice(-4).toUpperCase()}
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          inverted
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMine={item.senderId === user.uid}
              onOpenImage={setFullscreenImage}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyMessagesText}>Aucun message pour le moment</Text>
            </View>
          }
        />

        <View style={[styles.inputRow, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            onPress={() => setAttachSheetVisible(true)}
            style={styles.attachBtn}
            disabled={processingAttachment}
          >
            {processingAttachment ? (
              <ActivityIndicator size="small" color={colors.amberBright} />
            ) : (
              <IconPaperclip size={19} color={colors.text.secondary} strokeWidth={1.8} />
            )}
          </Pressable>
          <View style={styles.textInputWrap}>
            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={setText}
              placeholder="Votre message…"
              placeholderTextColor={colors.text.tertiary}
              multiline
            />
          </View>
          <Pressable
            onPress={handleSendText}
            disabled={!text.trim() || sending}
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          >
            <IconSend size={16} color="#221204" strokeWidth={2.2} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <BottomSheet visible={attachSheetVisible} onClose={() => setAttachSheetVisible(false)}>
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Joindre un fichier</Text>
          <Pressable onPress={handlePickFromGallery} style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.7 }]}>
            <IconImage size={19} color={colors.amberBright} strokeWidth={1.8} />
            <Text style={styles.sheetRowLabel}>Photo galerie</Text>
          </Pressable>
          <Pressable onPress={handleTakePhoto} style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.7 }]}>
            <IconCamera size={19} color={colors.amberBright} strokeWidth={1.8} />
            <Text style={styles.sheetRowLabel}>Prendre une photo</Text>
          </Pressable>
          <Pressable onPress={handlePickPdf} style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.7 }]}>
            <IconDocument size={19} color={colors.amberBright} strokeWidth={1.8} />
            <Text style={styles.sheetRowLabel}>PDF</Text>
          </Pressable>
        </View>
      </BottomSheet>

      <Modal visible={!!fullscreenImage} transparent animationType="fade" onRequestClose={() => setFullscreenImage(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFullscreenImage(null)}>
          {fullscreenImage && (
            <Image source={{ uri: fullscreenImage }} style={styles.modalImage} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg.surface },
    flex: { flex: 1 },
    topbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.xl,
      marginBottom: 10,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.glass,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    headerName: {
      fontFamily: FontFamily.sansBold,
      fontSize: 15,
      color: colors.text.primary,
    },
    orderBanner: {
      alignSelf: 'center',
      backgroundColor: colors.amberSoft,
      borderWidth: 1,
      borderColor: 'rgba(235,162,78,0.28)',
      borderRadius: Radius.pill,
      paddingVertical: 6,
      paddingHorizontal: 14,
      marginBottom: 10,
    },
    orderBannerText: {
      fontFamily: FontFamily.sansBold,
      fontSize: 12,
      color: colors.amberBright,
    },
    messagesList: {
      paddingHorizontal: Spacing.xl,
      paddingTop: 12,
      paddingBottom: 12,
      gap: 10,
    },
    emptyMessages: {
      paddingTop: 100,
      alignItems: 'center',
    },
    emptyMessagesText: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 13,
      color: colors.text.tertiary,
    },
    bubbleRow: { maxWidth: '80%', gap: 4 },
    bubbleRowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    bubbleRowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    bubble: {
      borderRadius: 18,
      paddingVertical: 10,
      paddingHorizontal: 14,
      gap: 6,
    },
    bubbleMine: {
      backgroundColor: 'rgba(235,162,78,0.85)',
      borderBottomRightRadius: 4,
    },
    bubbleTheirs: {
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderBottomLeftRadius: 4,
    },
    bubbleText: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 14,
      lineHeight: 19,
    },
    bubbleTextMine: { color: '#1a0d02' },
    bubbleTextTheirs: { color: colors.text.primary },
    bubbleTime: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 10.5,
      color: colors.text.tertiary,
      marginHorizontal: 4,
    },
    bubbleTimeMine: {},
    bubbleTimeTheirs: {},
    attachmentImage: {
      width: 160,
      height: 160,
      borderRadius: 12,
    },
    attachmentDoc: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 140,
    },
    attachmentDocName: {
      flex: 1,
      fontFamily: FontFamily.sansBold,
      fontSize: 12.5,
      color: colors.text.primary,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: Spacing.xl,
      paddingTop: 10,
    },
    attachBtn: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.glass,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textInputWrap: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border.glass,
      backgroundColor: colors.bg.card,
      paddingHorizontal: 14,
      paddingVertical: 9,
      justifyContent: 'center',
    },
    textInput: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 14,
      color: colors.text.primary,
      maxHeight: 100,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.amberBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: {
      opacity: 0.4,
    },
    sheetContent: {
      paddingHorizontal: 24,
      paddingBottom: 12,
      gap: 4,
    },
    sheetTitle: {
      fontFamily: FontFamily.serif,
      fontSize: 17,
      color: colors.text.primary,
      marginBottom: 14,
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      height: 52,
    },
    sheetRowLabel: {
      flex: 1,
      fontFamily: FontFamily.sansMedium,
      fontSize: 15,
      color: colors.text.primary,
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
  });
}
