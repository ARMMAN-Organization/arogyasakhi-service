import { OperationsService } from './operations.service';
import type { OperationsRepository } from './operations.repository';
import type { SakhiClient } from './sakhi.client';
import type {
  SupervisorEvent,
  EventGathering,
  GatheringTopic,
  GatheringAttendance,
  TopicMark,
  TrainingTopic,
} from '../../../../node_modules/.prisma/client-supervisor-operations-service';

describe('OperationsService — Meeting & Training flow', () => {
  const repository = {
    findEventById: jest.fn(),
    rescheduleEvent: jest.fn(),
    createEventPhoto: jest.fn(),
    findTrainingTopics: jest.fn(),
    createTrainingTopic: jest.fn(),
    findActiveTrainingTopicIds: jest.fn(),
    createGathering: jest.fn(),
    findGatheringById: jest.fn(),
    findGatheringTopics: jest.fn(),
    findGatheringAttendance: jest.fn(),
    upsertGatheringAttendance: jest.fn(),
    findTopicMark: jest.fn(),
    upsertTopicMark: jest.fn(),
    lockTopicMark: jest.fn(),
  } as unknown as jest.Mocked<OperationsRepository>;
  const sakhiClient = { findById: jest.fn() } as unknown as jest.Mocked<SakhiClient>;
  let service: OperationsService;

  const supervisorCaller = { id: 'supervisor-1', roles: ['SUPERVISOR'] };
  const otherSupervisorCaller = { id: 'other-supervisor', roles: ['SUPERVISOR'] };
  const adminCaller = { id: 'admin-1', roles: ['ADMIN'] };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new OperationsService(repository, sakhiClient);
  });

  const trainingEventRow: SupervisorEvent = {
    id: 'event-1',
    projectId: 'project-1',
    supervisorId: 'supervisor-1',
    eventType: 'TRAINING',
    eventDate: new Date('2026-08-01'),
    topicsJson: [],
    remarks: null,
    status: 'SCHEDULED',
    photoMediaId: null,
    createdAt: new Date(),
    createdByUserId: null,
    updatedAt: new Date(),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
  };

  const meetingEventRow: SupervisorEvent = { ...trainingEventRow, eventType: 'MEETING' };

  const gatheringRow: EventGathering = {
    id: 'gathering-1',
    eventId: 'event-1',
    gatheringDate: new Date('2026-08-01'),
    remarks: null,
    status: 'SCHEDULED',
    createdAt: new Date(),
    createdByUserId: null,
    updatedAt: new Date(),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
  };

  const topicRow: TrainingTopic = {
    id: 'topic-1',
    topicCode: 'ANEMIA',
    topicName: 'Anemia',
    status: 'ACTIVE',
    createdAt: new Date(),
    createdByUserId: null,
    updatedAt: new Date(),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
  };

  const gatheringTopicRow: GatheringTopic = {
    id: 'gathering-topic-1',
    gatheringId: 'gathering-1',
    topicId: 'topic-1',
    createdAt: new Date(),
    createdByUserId: null,
  };

  describe('listTrainingTopics / createTrainingTopic', () => {
    it('lists topics via repository', async () => {
      repository.findTrainingTopics.mockResolvedValue([topicRow]);
      await expect(service.listTrainingTopics()).resolves.toEqual([topicRow]);
    });

    it('creates a topic via repository', async () => {
      repository.createTrainingTopic.mockResolvedValue(topicRow);
      await expect(
        service.createTrainingTopic(
          { topicCode: 'ANEMIA', topicName: 'Anemia' } as never,
          'admin-1',
        ),
      ).resolves.toEqual(topicRow);
    });

    it('throws 409 on a duplicate topicCode', async () => {
      repository.createTrainingTopic.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.createTrainingTopic(
          { topicCode: 'ANEMIA', topicName: 'Anemia' } as never,
          'admin-1',
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('rescheduleEvent', () => {
    it('reschedules a SCHEDULED event owned by the caller', async () => {
      repository.findEventById.mockResolvedValue(trainingEventRow);
      const rescheduled = { ...trainingEventRow, eventDate: new Date('2026-08-10') };
      repository.rescheduleEvent.mockResolvedValue(rescheduled);

      const dto = { eventDate: new Date('2026-08-10') };
      await expect(service.rescheduleEvent('event-1', dto, supervisorCaller)).resolves.toBe(
        rescheduled,
      );
    });

    it('throws 404 when the event does not exist', async () => {
      repository.findEventById.mockResolvedValue(null);
      await expect(
        service.rescheduleEvent('missing', { eventDate: new Date() }, supervisorCaller),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('rejects a non-owner Supervisor', async () => {
      repository.findEventById.mockResolvedValue(trainingEventRow);
      await expect(
        service.rescheduleEvent('event-1', { eventDate: new Date() }, otherSupervisorCaller),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.rescheduleEvent).not.toHaveBeenCalled();
    });

    it('throws 409 when the event is not SCHEDULED', async () => {
      repository.findEventById.mockResolvedValue({ ...trainingEventRow, status: 'COMPLETED' });
      await expect(
        service.rescheduleEvent('event-1', { eventDate: new Date() }, supervisorCaller),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.rescheduleEvent).not.toHaveBeenCalled();
    });

    it('allows ADMIN to reschedule any event', async () => {
      repository.findEventById.mockResolvedValue(trainingEventRow);
      repository.rescheduleEvent.mockResolvedValue(trainingEventRow);
      await expect(
        service.rescheduleEvent('event-1', { eventDate: new Date() }, adminCaller),
      ).resolves.toBe(trainingEventRow);
    });
  });

  describe('addEventPhoto', () => {
    const photoRow = {
      id: 'photo-1',
      eventId: 'event-1',
      mediaId: 'media-1',
      createdAt: new Date(),
    };

    it('adds a photo to a SCHEDULED event owned by the caller', async () => {
      repository.findEventById.mockResolvedValue(trainingEventRow);
      repository.createEventPhoto.mockResolvedValue(photoRow as never);
      await expect(
        service.addEventPhoto('event-1', { mediaId: 'media-1' }, supervisorCaller),
      ).resolves.toEqual(photoRow);
    });

    it('throws 404 when the event does not exist', async () => {
      repository.findEventById.mockResolvedValue(null);
      await expect(
        service.addEventPhoto('missing', { mediaId: 'media-1' }, supervisorCaller),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('rejects a non-owner Supervisor', async () => {
      repository.findEventById.mockResolvedValue(trainingEventRow);
      await expect(
        service.addEventPhoto('event-1', { mediaId: 'media-1' }, otherSupervisorCaller),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('throws 409 when the event is COMPLETED', async () => {
      repository.findEventById.mockResolvedValue({ ...trainingEventRow, status: 'COMPLETED' });
      await expect(
        service.addEventPhoto('event-1', { mediaId: 'media-1' }, supervisorCaller),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('throws 409 when the event is CANCELLED', async () => {
      repository.findEventById.mockResolvedValue({ ...trainingEventRow, status: 'CANCELLED' });
      await expect(
        service.addEventPhoto('event-1', { mediaId: 'media-1' }, supervisorCaller),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('createGathering', () => {
    const dto = { gatheringDate: new Date('2026-08-01'), topicIds: ['topic-1'] };

    it('creates a gathering on a TRAINING event with active topics', async () => {
      repository.findEventById.mockResolvedValue(trainingEventRow);
      repository.findActiveTrainingTopicIds.mockResolvedValue(['topic-1']);
      repository.createGathering.mockResolvedValue({
        ...gatheringRow,
        topics: [gatheringTopicRow],
      } as never);

      await expect(service.createGathering('event-1', dto, supervisorCaller)).resolves.toEqual(
        expect.objectContaining({ id: 'gathering-1' }),
      );
    });

    it('throws 404 when the event does not exist', async () => {
      repository.findEventById.mockResolvedValue(null);
      await expect(service.createGathering('missing', dto, supervisorCaller)).rejects.toMatchObject(
        { status: 404 },
      );
    });

    it('rejects a non-owner Supervisor', async () => {
      repository.findEventById.mockResolvedValue(trainingEventRow);
      await expect(
        service.createGathering('event-1', dto, otherSupervisorCaller),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('rejects creating a gathering on a MEETING event', async () => {
      repository.findEventById.mockResolvedValue(meetingEventRow);
      await expect(service.createGathering('event-1', dto, supervisorCaller)).rejects.toMatchObject(
        { status: 422 },
      );
      expect(repository.createGathering).not.toHaveBeenCalled();
    });

    it('rejects a topicId that does not exist or is inactive', async () => {
      repository.findEventById.mockResolvedValue(trainingEventRow);
      repository.findActiveTrainingTopicIds.mockResolvedValue([]);
      await expect(service.createGathering('event-1', dto, supervisorCaller)).rejects.toMatchObject(
        { status: 422 },
      );
      expect(repository.createGathering).not.toHaveBeenCalled();
    });
  });

  describe('listGatheringTopics', () => {
    it("returns topics for a gathering under the caller's own event", async () => {
      repository.findGatheringById.mockResolvedValue(gatheringRow);
      repository.findEventById.mockResolvedValue(trainingEventRow);
      repository.findGatheringTopics.mockResolvedValue([gatheringTopicRow] as never);

      await expect(service.listGatheringTopics('gathering-1', supervisorCaller)).resolves.toEqual([
        gatheringTopicRow,
      ]);
    });

    it('throws 404 when the gathering does not exist', async () => {
      repository.findGatheringById.mockResolvedValue(null);
      await expect(service.listGatheringTopics('missing', supervisorCaller)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rejects a non-owner Supervisor', async () => {
      repository.findGatheringById.mockResolvedValue(gatheringRow);
      repository.findEventById.mockResolvedValue(trainingEventRow);
      await expect(
        service.listGatheringTopics('gathering-1', otherSupervisorCaller),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('allows ADMIN unrestricted', async () => {
      repository.findGatheringById.mockResolvedValue(gatheringRow);
      repository.findEventById.mockResolvedValue(trainingEventRow);
      repository.findGatheringTopics.mockResolvedValue([gatheringTopicRow] as never);
      await expect(service.listGatheringTopics('gathering-1', adminCaller)).resolves.toEqual([
        gatheringTopicRow,
      ]);
    });
  });

  describe('getGatheringAttendance / updateGatheringAttendance', () => {
    const attendanceRow: GatheringAttendance = {
      id: 'ga-1',
      gatheringId: 'gathering-1',
      sakhiId: 'sakhi-1',
      attendanceStatus: 'PRESENT',
      remarks: null,
      createdAt: new Date(),
      createdByUserId: null,
      updatedAt: new Date(),
      updatedByUserId: null,
      isDeleted: false,
      deletedAt: null,
    };

    it("returns attendance for the caller's own gathering", async () => {
      repository.findGatheringById.mockResolvedValue(gatheringRow);
      repository.findEventById.mockResolvedValue(trainingEventRow);
      repository.findGatheringAttendance.mockResolvedValue([attendanceRow]);

      await expect(
        service.getGatheringAttendance('gathering-1', supervisorCaller),
      ).resolves.toEqual([attendanceRow]);
    });

    it('rejects a non-owner Supervisor reading attendance', async () => {
      repository.findGatheringById.mockResolvedValue(gatheringRow);
      repository.findEventById.mockResolvedValue(trainingEventRow);
      await expect(
        service.getGatheringAttendance('gathering-1', otherSupervisorCaller),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("upserts attendance for the caller's own gathering", async () => {
      repository.findGatheringById.mockResolvedValue(gatheringRow);
      repository.findEventById.mockResolvedValue(trainingEventRow);
      repository.upsertGatheringAttendance.mockResolvedValue([attendanceRow]);

      const dto = { attendance: [{ sakhiId: 'sakhi-1', attendanceStatus: 'PRESENT' as const }] };
      await expect(
        service.updateGatheringAttendance('gathering-1', dto, supervisorCaller),
      ).resolves.toEqual([attendanceRow]);
    });

    it('rejects a non-owner Supervisor writing attendance', async () => {
      repository.findGatheringById.mockResolvedValue(gatheringRow);
      repository.findEventById.mockResolvedValue(trainingEventRow);
      const dto = { attendance: [{ sakhiId: 'sakhi-1', attendanceStatus: 'PRESENT' as const }] };
      await expect(
        service.updateGatheringAttendance('gathering-1', dto, otherSupervisorCaller),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.upsertGatheringAttendance).not.toHaveBeenCalled();
    });
  });

  describe('getTopicMark / upsertTopicMark / completeTopicMark', () => {
    const markRow: TopicMark = {
      id: 'mark-1',
      gatheringId: 'gathering-1',
      topicId: 'topic-1',
      sakhiId: 'sakhi-1',
      markType: 'PRE',
      score: 80 as never,
      isLocked: false,
      lockedAt: null,
      createdAt: new Date(),
      createdByUserId: null,
      updatedAt: new Date(),
      updatedByUserId: null,
    };
    const query = { gatheringId: 'gathering-1', sakhiId: 'sakhi-1', type: 'PRE' as const };
    const markDto = {
      gatheringId: 'gathering-1',
      sakhiId: 'sakhi-1',
      markType: 'PRE' as const,
      score: 80,
    };

    describe('getTopicMark', () => {
      it('returns an existing mark', async () => {
        repository.findGatheringById.mockResolvedValue(gatheringRow);
        repository.findEventById.mockResolvedValue(trainingEventRow);
        repository.findTopicMark.mockResolvedValue(markRow);

        await expect(service.getTopicMark('topic-1', query, supervisorCaller)).resolves.toEqual(
          markRow,
        );
      });

      it('throws 404 when the gathering does not exist', async () => {
        repository.findGatheringById.mockResolvedValue(null);
        await expect(
          service.getTopicMark('topic-1', query, supervisorCaller),
        ).rejects.toMatchObject({ status: 404 });
      });

      it('throws 404 when no mark exists yet', async () => {
        repository.findGatheringById.mockResolvedValue(gatheringRow);
        repository.findEventById.mockResolvedValue(trainingEventRow);
        repository.findTopicMark.mockResolvedValue(null);
        await expect(
          service.getTopicMark('topic-1', query, supervisorCaller),
        ).rejects.toMatchObject({ status: 404 });
      });

      it('rejects a non-owner Supervisor', async () => {
        repository.findGatheringById.mockResolvedValue(gatheringRow);
        repository.findEventById.mockResolvedValue(trainingEventRow);
        await expect(
          service.getTopicMark('topic-1', query, otherSupervisorCaller),
        ).rejects.toMatchObject({ status: 403 });
      });
    });

    describe('upsertTopicMark', () => {
      it('saves a mark for a topic that belongs to the gathering', async () => {
        repository.findGatheringById.mockResolvedValue(gatheringRow);
        repository.findEventById.mockResolvedValue(trainingEventRow);
        repository.findGatheringTopics.mockResolvedValue([gatheringTopicRow] as never);
        repository.findTopicMark.mockResolvedValue(null);
        repository.upsertTopicMark.mockResolvedValue(markRow);

        await expect(
          service.upsertTopicMark('topic-1', markDto, supervisorCaller),
        ).resolves.toEqual(markRow);
      });

      it('rejects a topic that is not part of the gathering', async () => {
        repository.findGatheringById.mockResolvedValue(gatheringRow);
        repository.findEventById.mockResolvedValue(trainingEventRow);
        repository.findGatheringTopics.mockResolvedValue([]);

        await expect(
          service.upsertTopicMark('topic-1', markDto, supervisorCaller),
        ).rejects.toMatchObject({ status: 422 });
        expect(repository.upsertTopicMark).not.toHaveBeenCalled();
      });

      it('throws 409 when the mark is already locked', async () => {
        repository.findGatheringById.mockResolvedValue(gatheringRow);
        repository.findEventById.mockResolvedValue(trainingEventRow);
        repository.findGatheringTopics.mockResolvedValue([gatheringTopicRow] as never);
        repository.findTopicMark.mockResolvedValue({ ...markRow, isLocked: true });

        await expect(
          service.upsertTopicMark('topic-1', markDto, supervisorCaller),
        ).rejects.toMatchObject({ status: 409 });
        expect(repository.upsertTopicMark).not.toHaveBeenCalled();
      });

      it('rejects a non-owner Supervisor', async () => {
        repository.findGatheringById.mockResolvedValue(gatheringRow);
        repository.findEventById.mockResolvedValue(trainingEventRow);
        await expect(
          service.upsertTopicMark('topic-1', markDto, otherSupervisorCaller),
        ).rejects.toMatchObject({ status: 403 });
      });
    });

    describe('completeTopicMark', () => {
      const completeDto = {
        gatheringId: 'gathering-1',
        sakhiId: 'sakhi-1',
        markType: 'PRE' as const,
      };

      it('locks an existing unlocked mark', async () => {
        repository.findGatheringById.mockResolvedValue(gatheringRow);
        repository.findEventById.mockResolvedValue(trainingEventRow);
        repository.findTopicMark.mockResolvedValue(markRow);
        repository.lockTopicMark.mockResolvedValue({ ...markRow, isLocked: true });

        await expect(
          service.completeTopicMark('topic-1', completeDto, supervisorCaller),
        ).resolves.toMatchObject({ isLocked: true });
      });

      it('throws 404 when no mark exists to lock', async () => {
        repository.findGatheringById.mockResolvedValue(gatheringRow);
        repository.findEventById.mockResolvedValue(trainingEventRow);
        repository.findTopicMark.mockResolvedValue(null);
        await expect(
          service.completeTopicMark('topic-1', completeDto, supervisorCaller),
        ).rejects.toMatchObject({ status: 404 });
      });

      it('throws 409 when the mark is already locked', async () => {
        repository.findGatheringById.mockResolvedValue(gatheringRow);
        repository.findEventById.mockResolvedValue(trainingEventRow);
        repository.findTopicMark.mockResolvedValue({ ...markRow, isLocked: true });
        await expect(
          service.completeTopicMark('topic-1', completeDto, supervisorCaller),
        ).rejects.toMatchObject({ status: 409 });
        expect(repository.lockTopicMark).not.toHaveBeenCalled();
      });

      it('rejects a non-owner Supervisor', async () => {
        repository.findGatheringById.mockResolvedValue(gatheringRow);
        repository.findEventById.mockResolvedValue(trainingEventRow);
        await expect(
          service.completeTopicMark('topic-1', completeDto, otherSupervisorCaller),
        ).rejects.toMatchObject({ status: 403 });
      });
    });
  });
});
