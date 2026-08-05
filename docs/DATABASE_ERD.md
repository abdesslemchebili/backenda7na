# ERD — Plateforme École d'Allemand Nourhen Albouchi

## Diagramme relationnel

```mermaid
erDiagram
    User ||--o{ EnrollmentRequest : "reviewedBy"
    User ||--o| EnrollmentRequest : "createdUserId"
    User }o--o| ClassGroup : "studentInfo.classGroupId"
    ClassGroup }o--|| User : "professorId"
    ClassGroup }o--o{ User : "studentIds"
    ClassGroup }o--o| Course : "courseId"

    EnrollmentRequest }o--o| ClassGroup : "assignedClassGroupId"

    User ||--o{ Payment : "student"
    User ||--o{ Payment : "reviewedBy"
    User ||--|| PlacementTestSubmission : "student"
    PlacementTest ||--o{ PlacementTestSubmission : "placementTest"

    User ||--o{ ExamSubmission : "student"
    Exam ||--o{ ExamSubmission : "exam"
    User ||--o{ Exam : "createdBy"

    User ||--o{ TeacherEarning : "professorId"

    Course ||--o{ Class : "course"
    Course ||--o{ Document : "course"
    Course ||--o{ Assignment : "course"
    Class }o--o| ClassGroup : "classGroupId"
    Class ||--o{ Attendance : "class"
    User ||--o{ Attendance : "student"
    User ||--o{ Notification : "recipient"
    Assignment ||--o{ AssignmentSubmission : "assignment"
```

## Entités principales

| Entité | Rôle |
|--------|------|
| **User** | Comptes ADMIN / TEACHER (professor) / STUDENT avec statuts paiement et niveau allemand |
| **EnrollmentRequest** | Demandes d'inscription publiques → workflow approbation |
| **Payment** | Preuves de paiement (virement / poste) |
| **PlacementTest** | Test de niveau obligatoire après 1ère connexion |
| **PlacementTestSubmission** | Résultat par étudiant (1 seul) |
| **Exam** | Examen de fin de sous-niveau (A1.1 → C2.2) |
| **ExamSubmission** | Soumission et progression automatique |
| **TeacherEarning** | Revenus mensuels par professeur |
| **ClassGroup** | Cohorte avec niveau, sous-niveau, capacité, horaires |
| **Class** | Sessions live (Jitsi) ou enregistrées |
| **Course** | Contenu pédagogique multilingue |
| **Document / Assignment** | Matériaux et devoirs |
| **Notification** | Alertes in-app (+ email via `notifyUser`) |

## Niveaux allemands (CEFR)

Progression : `A1.1 → A1.2 → A2.1 → … → C2.2`

Stockés dans `User.studentInfo.germanSubLevel` et `ClassGroup.subLevel`.

## Statuts étudiant

| Champ | Valeurs |
|-------|---------|
| `User.status` | invited, pending, verified, reglo (ACTIVE), suspended |
| `User.paymentStatus` | PENDING_PAYMENT, PAYMENT_SUBMITTED, PAYMENT_APPROVED, PAYMENT_REJECTED |

Accès aux contenus : `status === reglo` uniquement.

## Index recommandés

- `EnrollmentRequest`: `{ status, createdAt }`, `{ email }`
- `Payment`: `{ student, createdAt }`, `{ status }`
- `PlacementTestSubmission`: `{ student }` unique
- `ExamSubmission`: `{ student, exam }` unique
- `TeacherEarning`: `{ professorId, month }` unique
- `User`: `{ role, status }`, `{ username }` sparse unique
